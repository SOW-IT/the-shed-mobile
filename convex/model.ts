import { ConvexError } from "convex/values";
import {
  ADMIN_DEPARTMENTS,
  ADMIN_DIVISIONS,
  assignmentsOf,
  departmentsOf,
  DIRECTOR,
  FINANCE,
  roleNeedsUniversity,
  rolesOfLike,
  incomingStaffYear as incomingStaffYearForDate,
  staffYearForDate,
  withinRolloverAuthGrace,
} from "../shared/flow";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export const DELEGATION_QUERY_LIMIT = 500;

export const currentStaffYear = () => staffYearForDate(new Date());
export const nextStaffYear = () => currentStaffYear() + 1;
export const incomingStaffYear = () => incomingStaffYearForDate(new Date());

export const allowedDomain = () =>
  process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";

export const isOrgEmail = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase().endsWith(`@${allowedDomain()}`);

export async function optionalEmail(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const [rawUserId] = identity.subject.split("|");
  const userId = ctx.db.normalizeId("users", rawUserId);
  if (userId) {
    const user = await ctx.db.get("users", userId);
    if (user?.email) return user.email.toLowerCase();
  }
  return identity.email?.toLowerCase() ?? null;
}

export async function requireEmail(ctx: Ctx): Promise<string> {
  const email = await optionalEmail(ctx);
  if (!email) {
    throw new ConvexError("You must be signed in.");
  }
  return email;
}

async function profileForCurrentYear(
  ctx: Ctx,
  email: string
): Promise<CallerContext | null> {
  const year = currentStaffYear();
  const profile = await getProfile(ctx, email, year);
  if (profile) return { email, year, profile };
  if (!withinRolloverAuthGrace(year)) return null;
  const previous = await getProfile(ctx, email, year - 1);
  if (!previous) return null;
  return { email, year, profile: previous };
}

export async function optionalProfile(ctx: Ctx): Promise<CallerContext | null> {
  const email = await optionalEmail(ctx);
  if (!email) return null;
  return await profileForCurrentYear(ctx, email);
}

export async function getProfile(
  ctx: Ctx,
  email: string,
  year: number
): Promise<Doc<"staffProfiles"> | null> {
  return await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
    .first();
}

export async function findMemberByEmail(
  ctx: Ctx,
  email: string | undefined
): Promise<Doc<"attendanceMembers"> | null> {
  for (const candidate of staffEmailCandidates(email)) {
    const byEmail = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_email", (q) => q.eq("email", candidate))
      .first();
    if (byEmail) return byEmail;
  }
  return null;
}

export async function displayName(
  ctx: Ctx,
  email: string,
  year: number
): Promise<string> {
  for (const candidate of staffEmailCandidates(email)) {
    const profile = await getProfile(ctx, candidate, year);
    if (profile?.name) return profile.name;
  }
  const dirUser = await ctx.db
    .query("directoryUsers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return dirUser?.name ?? email;
}

export interface CallerContext {
  email: string;
  year: number;
  profile: Doc<"staffProfiles">;
}

export async function requireProfile(ctx: Ctx): Promise<CallerContext> {
  const email = await requireEmail(ctx);
  const caller = await profileForCurrentYear(ctx, email);
  if (!caller) {
    const year = currentStaffYear();
    throw new ConvexError(
      `No role/department assigned to ${email} for ${year}. Ask an admin to set you up.`
    );
  }
  return caller;
}

export const rolesOf = (profile: Doc<"staffProfiles">): string[] =>
  rolesOfLike(profile);

export async function isAdminProfile(
  ctx: Ctx,
  profile: Doc<"staffProfiles">
): Promise<boolean> {
  const roles = rolesOf(profile);
  if (roles.includes(DIRECTOR)) return true;
  const headed = await divisionsHeadedBy(ctx, profile.year, profile.email);
  if (headed.some((division) => ADMIN_DIVISIONS.includes(division.name))) {
    return true;
  }
  for (const dept of departmentsOf(profile)) {
    if (ADMIN_DEPARTMENTS.includes(dept)) return true;
    const department = await getDepartment(ctx, profile.year, dept);
    if (department !== null && ADMIN_DIVISIONS.includes(department.division)) {
      return true;
    }
  }
  return false;
}

export async function requireAdmin(ctx: Ctx): Promise<CallerContext> {
  const caller = await requireProfile(ctx);
  if (!(await isAdminProfile(ctx, caller.profile))) {
    throw new ConvexError(
      "Only admins (Data and IT / Human Resources division) can do this."
    );
  }
  return caller;
}

export async function isAttendanceManagerProfile(
  ctx: Ctx,
  profile: Doc<"staffProfiles">
): Promise<boolean> {
  if (await isAdminProfile(ctx, profile)) return true;
  return assignmentsOf(profile).some(
    (assignment) =>
      assignment.university !== undefined && roleNeedsUniversity(assignment.role)
  );
}

export async function requireAttendanceManager(ctx: Ctx): Promise<CallerContext> {
  const caller = await requireProfile(ctx);
  if (!(await isAttendanceManagerProfile(ctx, caller.profile))) {
    throw new ConvexError("Only admins or campus leaders can manage attendance settings.");
  }
  return caller;
}

export async function staffProfilesForEmail(
  ctx: Ctx,
  email: string
): Promise<Doc<"staffProfiles">[]> {
  const byId = new Map<string, Doc<"staffProfiles">>();
  for (const candidate of staffEmailCandidates(email)) {
    const rows = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", candidate))
      .take(50);
    for (const row of rows) byId.set(row._id, row);
  }
  return [...byId.values()].sort((a, b) => b.year - a.year);
}

export async function findProfileForYear(
  ctx: Ctx,
  email: string,
  year: number
): Promise<Doc<"staffProfiles"> | null> {
  for (const candidate of staffEmailCandidates(email)) {
    const profile = await getProfile(ctx, candidate, year);
    if (profile) return profile;
  }
  return null;
}

export async function resolveStaffIdentity(
  ctx: MutationCtx,
  email: string
): Promise<{
  importId?: string;
  name?: string;
  userId?: Id<"users">;
}> {
  const profiles = await staffProfilesForEmail(ctx, email);
  let importId = profiles.find((p) => p.importId !== undefined)?.importId;
  if (!importId) {
    for (const candidate of staffEmailCandidates(email)) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", candidate))
        .first();
      if (user) {
        importId = user._id;
        break;
      }
    }
  }
  if (!importId && profiles[0]) importId = profiles[0]._id;

  if (importId) {
    for (const profile of profiles) {
      if (profile.importId === undefined) {
        await ctx.db.patch("staffProfiles", profile._id, { importId });
      }
    }
  }

  let name = profiles.find((p) => p.name)?.name;
  if (!name) {
    for (const candidate of staffEmailCandidates(email)) {
      const dirUser = await ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", candidate))
        .unique();
      if (dirUser?.name) {
        name = dirUser.name;
        break;
      }
    }
  }

  return {
    importId,
    name,
    userId: profiles.find((p) => p.userId !== undefined)?.userId,
  };
}

export async function getDepartment(
  ctx: Ctx,
  year: number,
  name: string
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
    .first();
}

export async function getDivision(
  ctx: Ctx,
  year: number,
  name: string
): Promise<Doc<"divisions"> | null> {
  return await ctx.db
    .query("divisions")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
    .unique();
}

export async function divisionsHeadedBy(
  ctx: Ctx,
  year: number,
  email: string
): Promise<Doc<"divisions">[]> {
  const divisions = await ctx.db
    .query("divisions")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(200);
  return divisions.filter((d) => d.headEmail === email);
}

export async function getYearSettings(
  ctx: Ctx,
  year: number
): Promise<Doc<"yearSettings"> | null> {
  return await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q) => q.eq("year", year))
    .first();
}

export async function delegatorsForYear(
  ctx: Ctx,
  year: number,
  email: string
): Promise<string[]> {
  const rows = await ctx.db
    .query("approverDelegations")
    .withIndex("by_year_and_to", (q) => q.eq("year", year).eq("toEmail", email))
    .take(DELEGATION_QUERY_LIMIT);
  return rows.map((r) => r.fromEmail);
}

export async function delegatesForYear(
  ctx: Ctx,
  year: number,
  fromEmail: string
): Promise<string[]> {
  const rows = await ctx.db
    .query("approverDelegations")
    .withIndex("by_year_and_from", (q) =>
      q.eq("year", year).eq("fromEmail", fromEmail)
    )
    .take(DELEGATION_QUERY_LIMIT);
  return rows.map((r) => r.toEmail);
}

export async function withDelegatesForYear(
  ctx: Ctx,
  year: number,
  email: string | undefined
): Promise<string[]> {
  if (!email) return [];
  return [...new Set([email, ...(await delegatesForYear(ctx, year, email))])];
}

export async function actAsEmails(
  ctx: Ctx,
  year: number,
  email: string
): Promise<Set<string>> {
  return new Set([email, ...(await delegatorsForYear(ctx, year, email))]);
}

export interface Approvers {
  hodEmail?: string;
  budgetManagerEmail?: string;
  financeHeadEmail?: string;
  directorEmail?: string;
}

export async function setCachedDirectorEmail(
  ctx: MutationCtx,
  year: number,
  directorEmail: string | undefined
): Promise<void> {
  const value = directorEmail && directorEmail.length > 0 ? directorEmail : "";
  const settings = await getYearSettings(ctx, year);
  if (settings) {
    if (settings.directorEmail === value) return;
    await ctx.db.patch("yearSettings", settings._id, { directorEmail: value });
    return;
  }
  await ctx.db.insert("yearSettings", { year, directorEmail: value });
}

export async function getApprovers(
  ctx: Ctx,
  year: number,
  departmentName: string
): Promise<Approvers> {
  const department = await getDepartment(ctx, year, departmentName);
  const finance = await getDepartment(ctx, year, FINANCE);
  const settings = await getYearSettings(ctx, year);
  let directorEmail: string | undefined;
  if (settings?.directorEmail !== undefined) {
    directorEmail =
      settings.directorEmail === "" ? undefined : settings.directorEmail;
  } else {
    for await (const profile of ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))) {
      if (rolesOf(profile).includes(DIRECTOR)) {
        directorEmail = profile.email;
        break;
      }
    }
  }
  return {
    hodEmail: department?.headEmail,
    budgetManagerEmail: settings?.budgetManagerEmail,
    financeHeadEmail: finance?.headEmail,
    directorEmail,
  };
}

export async function departmentsHeadedBy(
  ctx: Ctx,
  year: number,
  email: string
): Promise<Doc<"departments">[]> {
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(200);
  return departments.filter((d) => d.headEmail === email);
}
