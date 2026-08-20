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
  withinRolloverAuthGrace,
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
 * The organisation's Google Workspace domain (staff accounts). Personal
 * (non-staff) accounts can sign in too (1.7.4) but never resolve to a staff
 * profile and are kept out of the admin Users assignment lists.
 */
export const allowedDomain = () =>
  process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";

/** True when an email belongs to the organisation's staff domain. */
export const isOrgEmail = (email: string | null | undefined): boolean =>
  !!email && email.toLowerCase().endsWith(`@${allowedDomain()}`);

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

/**
 * Resolve the caller's staff profile for the live staff year, with a short
 * post-Oct-1 grace: if the new year has no profile yet but the previous year
 * does, and we're still inside `withinRolloverAuthGrace`, reuse the previous
 * profile while keeping `year` as the *current* staff year. That way the app
 * stays usable for ~a week after rollover (approve carry-overs, browse Admin)
 * while admins finish provisioning, without writing new requests into the old
 * year.
 */
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

/** Caller context for queries: null when unauthenticated or unprovisioned. */
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
  // `.first()` (not `.unique()`) so a stray duplicate (email, year) — e.g. one
  // transiently present mid-import or mid-rollover — can never throw inside a
  // read and take down every admin query that gates on the caller's profile.
  // Write paths still enforce one profile per person-year. Same rationale as
  // findMemberByEmail.
  return await ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
    .first();
}

/**
 * The single attendance-member row for an email, if any. An attendance member
 * links to a staff profile purely by its `email` column; both SOW-domain
 * spellings are tried (staffEmailCandidates).
 *
 * The `by_email` lookup is EXACT, so this is only case- and
 * whitespace-insensitive because stored emails are normalised (trim +
 * lowercase) on every write path (create/update/ensureForStaff/import). A
 * looked-up candidate is likewise lowercased by staffEmailCandidates, so both
 * sides match. Uses `.first()` (not `.unique()`) so a stray duplicate email can
 * never throw inside a read.
 */
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
  const caller = await profileForCurrentYear(ctx, email);
  if (!caller) {
    const year = currentStaffYear();
    throw new ConvexError(
      `No role/department assigned to ${email} for ${year}. Ask an admin to set you up.`
    );
  }
  return caller;
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
  // `.first()` (not `.unique()`) so a stray duplicate (year, name) can't throw
  // inside a read — isAdminProfile and the finance gate call this on every
  // admin query, so a single duplicate would otherwise blank the admin screen.
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
  // `.first()` (not `.unique()`) so a stray duplicate yearSettings row — e.g.
  // mid-import / mid-re-copy — can't throw and abort rollover or Finance
  // settings reads. Same rationale as getProfile / getDepartment.
  return await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q) => q.eq("year", year))
    .first();
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
 * Emails covering `fromEmail` for `year` (their delegates / stand-ins). Used
 * to fan out approval / reminder / receipt-ready notifications so stand-ins
 * get the same push as the officeholder.
 */
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

/**
 * `email` plus everyone covering them for `year`. Empty when `email` is missing.
 */
export async function withDelegatesForYear(
  ctx: Ctx,
  year: number,
  email: string | undefined
): Promise<string[]> {
  if (!email) return [];
  return [...new Set([email, ...(await delegatesForYear(ctx, year, email))])];
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

/**
 * Cache the year's Director email on `yearSettings` so getApprovers doesn't
 * walk every staff profile. Pass an email to set, or `""` / `undefined` to
 * record "known absent" (empty string) so subsequent reads skip the scan.
 */
export async function setCachedDirectorEmail(
  ctx: MutationCtx,
  year: number,
  directorEmail: string | undefined
): Promise<void> {
  // Empty string = known absent (skip scan). A missing field still means
  // "not yet cached" and triggers a one-time profile walk.
  const value = directorEmail && directorEmail.length > 0 ? directorEmail : "";
  const settings = await getYearSettings(ctx, year);
  if (settings) {
    if (settings.directorEmail === value) return;
    await ctx.db.patch("yearSettings", settings._id, { directorEmail: value });
    return;
  }
  await ctx.db.insert("yearSettings", { year, directorEmail: value });
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
  // Prefer the cached Director on yearSettings (maintained by Admin when the
  // role is assigned/cleared). `""` means "known absent" — skip the scan.
  // Missing field means not yet cached → one-time profile scan so legacy years
  // without a cache still resolve correctly.
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
