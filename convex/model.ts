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
  staffYearForDate,
} from "../shared/flow";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Read bound shared by every approver-delegation query (delegatorsForYear here
 * and admin.listDelegations) so the authorization set can't silently disagree
 * with the admin list. Delegations are admin-created — a single person being a
 * delegate of hundreds of approvers is implausible, so this never truncates.
 */
export const DELEGATION_QUERY_LIMIT = 500;

export const currentStaffYear = () => staffYearForDate(new Date());
export const nextStaffYear = () => currentStaffYear() + 1;

/**
 * The caller's email, or null when unauthenticated. Convex Auth JWTs carry
 * ONLY `sub` (userId|sessionId) — no email claim — so the email is resolved
 * from the caller's users row; the identity email claim is a fallback for
 * other token shapes (and tests). QUERIES should use this and return null
 * rather than throwing: the client briefly runs queries while auth tokens
 * attach, and a thrown query crashes the React tree.
 */
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

/** Caller context for queries: null when unauthenticated or unprovisioned. */
export async function optionalProfile(ctx: Ctx): Promise<CallerContext | null> {
  const email = await optionalEmail(ctx);
  if (!email) return null;
  const year = currentStaffYear();
  const profile = await getProfile(ctx, email, year);
  if (!profile) return null;
  return { email, year, profile };
}

export async function getProfile(
  ctx: Ctx,
  email: string,
  year: number
): Promise<Doc<"staffProfiles"> | null> {
  return await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
    .unique();
}

/**
 * The single attendance-member row for an email, if any. An attendance member
 * links to a staff profile purely by its `email` column now (both SOW-domain
 * spellings, case- and whitespace-insensitive, via staffEmailCandidates).
 *
 * During the `staffEmail` → `email` migration window this also falls back to the
 * legacy `by_staff_email` index so a row that hasn't been backfilled yet is
 * still found; that fallback is removed once `dropStaffEmail` has run
 * everywhere. Uses `.first()` (not `.unique()`) so a stray duplicate email can
 * never throw inside a read.
 */
export async function findMemberByEmail(
  ctx: Ctx,
  email: string | undefined
): Promise<Doc<"attendanceMembers"> | null> {
  const candidates = staffEmailCandidates(email);
  for (const candidate of candidates) {
    const byEmail = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_email", (q) => q.eq("email", candidate))
      .first();
    if (byEmail) return byEmail;
  }
  // DEPRECATED widen-window fallback — drop with the by_staff_email index once
  // the dropStaffEmail backfill has completed on every deployment.
  for (const candidate of candidates) {
    const byStaff = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_staff_email", (q) => q.eq("staffEmail", candidate))
      .first();
    if (byStaff) return byStaff;
  }
  return null;
}

/**
 * A person's display name for notifications: their staff profile name, the
 * directory name as a fallback, else the raw email when we know nothing else.
 * Used so emails never leak into notification titles/bodies.
 */
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

/** The signed-in caller plus their profile for the current staff year. */
export async function requireProfile(ctx: Ctx): Promise<CallerContext> {
  const email = await requireEmail(ctx);
  const year = currentStaffYear();
  const profile = await getProfile(ctx, email, year);
  if (!profile) {
    throw new ConvexError(
      `No role/department assigned to ${email} for ${year}. Ask an admin to set you up.`
    );
  }
  return { email, year, profile };
}

/** A profile's roles; reads the legacy single-role field transparently. */
export const rolesOf = (profile: Doc<"staffProfiles">): string[] =>
  rolesOfLike(profile);

/**
 * Admins: the Director, the Head of the Human Resources division, the
 * Data and IT department, and any department in the Human Resources division.
 */
export async function isAdminProfile(
  ctx: Ctx,
  profile: Doc<"staffProfiles">
): Promise<boolean> {
  const roles = rolesOf(profile);
  if (roles.includes(DIRECTOR)) return true;
  // Head of any admin division — read from the authoritative division docs
  // (headEmail), which already covers a person who heads several divisions.
  const headed = await divisionsHeadedBy(ctx, profile.year, profile.email);
  if (headed.some((division) => ADMIN_DIVISIONS.includes(division.name))) {
    return true;
  }
  // Membership in any admin department, or any department under an admin division.
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

/**
 * Attendance settings/catalogue managers: full admins plus campus leaders.
 * Roll-call actions can stay broad, but shared tags/metadata should not be
 * mutable by every staff profile.
 */
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

/**
 * The durable person key to stamp on a profile being created for `email`:
 * an existing profile's importId for that email (people from the old app),
 * else their users row id (people who joined after the migration), else
 * undefined — userLink fills it with the user id at their first sign-in.
 */
export async function resolveImportId(
  ctx: Ctx,
  email: string
): Promise<string | undefined> {
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email))
    .take(50);
  const existing = profiles.find((p) => p.importId !== undefined);
  if (existing) return existing.importId;
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user?._id;
}

export async function getDepartment(
  ctx: Ctx,
  year: number,
  name: string
): Promise<Doc<"departments"> | null> {
  return await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
    .unique();
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

/** Divisions the given email heads this year. */
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
    .unique();
}

/**
 * Emails that have delegated their approver authority to `email` for `year`
 * (out-of-office cover). Bounded; a person covers at most a handful of others.
 */
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

/**
 * The set of approver-identities `email` may act as for `year`: themselves plus
 * anyone who delegated their authority to them. Used to widen the "is the
 * caller this step's approver?" checks so a delegate can stand in.
 */
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

/** Resolves who approves each step for a request in a department this year. */
export async function getApprovers(
  ctx: Ctx,
  year: number,
  departmentName: string
): Promise<Approvers> {
  const department = await getDepartment(ctx, year, departmentName);
  const finance = await getDepartment(ctx, year, FINANCE);
  const settings = await getYearSettings(ctx, year);
  // Roles are arrays now, so the Director is found by scanning the year's
  // profiles (small table) rather than via the legacy role index.
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(1000);
  const directorProfile = profiles.find((p) => rolesOf(p).includes(DIRECTOR));
  return {
    hodEmail: department?.headEmail,
    budgetManagerEmail: settings?.budgetManagerEmail,
    financeHeadEmail: finance?.headEmail,
    directorEmail: directorProfile?.email,
  };
}

/** Departments the given email heads this year (Finance included). */
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
