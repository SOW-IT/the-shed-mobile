import { v } from "convex/values";
import {
  assignmentsOf,
  departmentsOf,
  DIRECTOR,
  divisionsOf,
  FINANCE,
  HEAD_OF_DIVISION,
  isMemberOfDepartment,
  roleNeedsUniversity,
} from "../shared/flow";
import { query } from "./_generated/server";
import {
  currentStaffYear,
  delegatorsForYear,
  departmentsHeadedBy,
  getApprovers,
  getProfile,
  isAdminProfile,
  nextStaffYear,
  optionalEmail,
  rolesOf,
} from "./model";

/** Authenticated-only info query used by admin sync and other tooling. */
export const serverInfo = query({
  args: {},
  handler: async (ctx) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const year = currentStaffYear();
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    return {
      staffYear: year,
      nextStaffYear: nextStaffYear(),
      allowedDomain: process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au",
      divisions: divisions.map((d) => d.name),
      departments: departments.map((d) => ({ name: d.name, division: d.division })),
    };
  },
});

/** The signed-in caller's profile and capabilities for the current year. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const year = currentStaffYear();
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    const profile = await getProfile(ctx, email, year);
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const photo = user?.avatarId
      ? await ctx.storage.getUrl(user.avatarId)
      : (user?.image ??
        (dirUser?.photoId ? await ctx.storage.getUrl(dirUser.photoId) : null));
    const name = user?.name ?? dirUser?.name ?? profile?.name ?? null;
    if (!profile) {
      return { email, year, name, photo, profile: null };
    }
    const approvers = await getApprovers(
      ctx,
      year,
      departmentsOf(profile)[0] ?? divisionsOf(profile)[0] ?? ""
    );
    const headedDepartments = (await departmentsHeadedBy(ctx, year, email)).map(
      (d) => d.name
    );
    // People who delegated their approver authority to the caller, so a stand-in
    // sees the To Review tab even without an approver role of their own. Checks
    // the current AND previous year to match toReview's carry-over window — a
    // delegate covering last year's approver can still act on leftover requests.
    const [delegatedTo, prevDelegatedTo] = await Promise.all([
      delegatorsForYear(ctx, year, email),
      delegatorsForYear(ctx, year - 1, email),
    ]);
    const isDelegate = delegatedTo.length > 0 || prevDelegatedTo.length > 0;
    return {
      email,
      year,
      name,
      photo,
      profile: {
        roles: rolesOf(profile),
        assignments: assignmentsOf(profile),
        department: departmentsOf(profile)[0] ?? null,
        division: divisionsOf(profile)[0] ?? null,
        departments: departmentsOf(profile),
        divisions: divisionsOf(profile),
      },
      isAdmin: await isAdminProfile(ctx, profile),
      isFinance: isMemberOfDepartment(profile, FINANCE),
      isDirector: rolesOf(profile).includes(DIRECTOR),
      isBudgetManager: approvers.budgetManagerEmail === email,
      isFinanceHead: approvers.financeHeadEmail === email,
      headedDepartments,
      // Whether the caller is currently covering anyone as a delegate.
      isDelegate,
      isApprover:
        headedDepartments.some((d) => d !== FINANCE) ||
        approvers.budgetManagerEmail === email ||
        approvers.financeHeadEmail === email ||
        rolesOf(profile).includes(DIRECTOR) ||
        isDelegate,
      /** President / VP / Executive / Student Leader — attendance-first UX. */
      isCampusLeader: assignmentsOf(profile).some((a) => roleNeedsUniversity(a.role)),
    };
  },
});

/** Resolves a display name for any staff email — used on request cards. */
export const nameForEmail = query({
  args: { email: v.string(), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    // Resolve against the given staff year so historical requests show the
    // requester's name as it was that year (legacy people have no user
    // account, but their imported staffProfile carries the name).
    const year = args.year ?? currentStaffYear();
    const profile = await getProfile(ctx, args.email, year);
    if (profile?.name) return profile.name;
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    return dirUser?.name ?? null;
  },
});

/** Every year with an org structure, plus the current and next staff years. */
export const availableYears = query({
  args: {},
  handler: async (ctx) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const divisions = await ctx.db.query("divisions").take(1000);
    return [
      ...new Set([
        ...divisions.map((d) => d.year),
        currentStaffYear(),
        nextStaffYear(),
      ]),
    ].sort((a, b) => b - a);
  },
});

/** Legacy role that fills the Director slot when no real Director exists. */
const INTERIM_DIRECTOR = "Interim Director";
/** Synthetic division name used by the importer when a year has no real divisions. */
const FALLBACK_DIVISION = "General";

const CAMPUS_ROLE_ORDER = ["President", "Vice President", "Executive", "Student Leader"] as const;
const campusRoleRank = (roles: string[]) => {
  const idx = CAMPUS_ROLE_ORDER.findIndex((r) => roles.includes(r));
  return idx === -1 ? CAMPUS_ROLE_ORDER.length : idx;
};

/**
 * The organisation chart for a staff year (defaults to the current one):
 * Director on top, then divisions -> departments (head first) -> members.
 * Names come from the synced Google profile when the person has signed in.
 * Also returns every year that has an org structure, for the year dropdown.
 */
export const orgChart = query({
  args: { year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth still attaching
    const year = args.year ?? currentStaffYear();

    // Distinct years with any structure (divisions are a handful per year).
    const allDivisions = await ctx.db.query("divisions").take(1000);
    const availableYears = [
      ...new Set([...allDivisions.map((d) => d.year), currentStaffYear()]),
    ].sort((a, b) => b - a);

    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .take(1000);

    const directoryUsers = await ctx.db.query("directoryUsers").take(4000);
    const directoryByEmail = new Map(
      directoryUsers.map((u) => [u.email, u] as const)
    );

    const nameByEmail: Record<string, string | null> = {};
    const photoByEmail: Record<string, string | null> = {};
    for (const profile of profiles) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", profile.email))
        .first();
      const dir = directoryByEmail.get(profile.email);
      nameByEmail[profile.email] =
        user?.name ?? dir?.name ?? profile.name ?? null;
      // Preference order: a custom uploaded photo, then the Google photo synced
      // on sign-in, then the directory thumbnail cached for people who haven't
      // signed in yet.
      photoByEmail[profile.email] = user?.avatarId
        ? await ctx.storage.getUrl(user.avatarId)
        : (user?.image ??
          (dir?.photoId ? await ctx.storage.getUrl(dir.photoId) : null));
    }
    const person = (email: string, role?: string) => ({
      email,
      name: nameByEmail[email] ?? null,
      photo: photoByEmail[email] ?? null,
      role: role ?? null,
    });

    // Org-chart placement is derived strictly from each profile's stored
    // `assignments` — never the legacy single-scope fields (assignmentsOf would
    // otherwise fall back to them). These read the assignments array directly.
    const assignmentsFor = (p: (typeof profiles)[number]) => p.assignments ?? [];
    const rolesFor = (p: (typeof profiles)[number]) => [
      ...new Set(assignmentsFor(p).map((a) => a.role)),
    ];

    // A real Director wins; otherwise an "Interim Director" fills the slot.
    const directorProfile =
      profiles.find((p) => rolesFor(p).includes(DIRECTOR)) ??
      profiles.find((p) => rolesFor(p).includes(INTERIM_DIRECTOR)) ??
      null;
    const directorEmail = directorProfile?.email ?? null;
    const directorRole =
      directorProfile && rolesFor(directorProfile).includes(DIRECTOR)
        ? DIRECTOR
        : INTERIM_DIRECTOR;

    // "Staff" = people with no department, no real division and no campus role,
    // who hold a non-campus role (anyone other than President / Vice President /
    // Executive / Student Leader), and aren't the director.
    const staffPeople = profiles
      .filter((p) => {
        const myAssignments = assignmentsFor(p);
        const hasRealDivision = myAssignments.some(
          (a) => a.division && a.division !== FALLBACK_DIVISION
        );
        const hasDept = myAssignments.some((a) => a.department);
        const isCampus = myAssignments.some(
          (a) => a.university && roleNeedsUniversity(a.role)
        );
        const hasStaffRole = rolesFor(p).some((r) => !roleNeedsUniversity(r));
        return (
          !hasDept &&
          !hasRealDivision &&
          !isCampus &&
          hasStaffRole &&
          p.email !== directorEmail
        );
      })
      .sort((a, b) =>
        (nameByEmail[a.email] ?? a.email).localeCompare(nameByEmail[b.email] ?? b.email)
      )
      .map((p) => person(p.email, rolesFor(p).join(", ")));

    // Years before divisions/departments existed keep their "General" division
    // (older departments are grouped under it). When such a year has no real
    // departments, the staff are shown in a synthesised "Staff" department under
    // General rather than as a separate top-level group.
    const generalExists = divisions.some((d) => d.name === FALLBACK_DIVISION);
    const staffUnderGeneral = generalExists && departments.length === 0;

    return {
      year,
      availableYears,
      director: directorProfile
        ? person(directorProfile.email, directorRole)
        : null,
      // Shown as a top-level group — except in legacy years where they live in
      // a "Staff" department under the General division instead (see below).
      staff: staffUnderGeneral ? [] : staffPeople,
      divisions: divisions.map((division) => {
        // The head named on the division wins (one person can head several);
        // fall back to a profile whose assignments head this division.
        const divisionHead =
          division.headEmail ??
          profiles.find((p) =>
            assignmentsFor(p).some(
              (a) => a.role === HEAD_OF_DIVISION && a.division === division.name
            )
          )?.email;
        const realDepartments = departments
          .filter((department) => department.division === division.name)
          .map((department) => ({
            name: department.name,
            colour: department.colour ?? null,
            head: department.headEmail ? person(department.headEmail) : null,
            // A person appears under every department they're linked to,
            // tagged with the role(s) they hold there.
            members: profiles
              .filter(
                (p) =>
                  assignmentsFor(p).some((a) => a.department === department.name) &&
                  p.email !== department.headEmail &&
                  p.email !== directorEmail
              )
              .map((p) =>
                person(
                  p.email,
                  assignmentsFor(p)
                    .filter((a) => a.department === department.name)
                    .map((a) => a.role)
                    .join(", ")
                )
              ),
          }));
        return {
          name: division.name,
          head: divisionHead ? person(divisionHead, HEAD_OF_DIVISION) : null,
          // Legacy years with no real departments get a synthesised "Staff"
          // department under General holding everyone who isn't campus.
          departments:
            staffUnderGeneral && division.name === FALLBACK_DIVISION
              ? [{ name: "Staff", colour: null, head: null, members: staffPeople }]
              : realDepartments,
        };
      }),
      // Campus people (Student Leaders, Executives, …) belong to a
      // university via a campus-role assignment. Chaplains carry a university
      // too but render under the Chaplaincy department, so only campus roles
      // surface here.
      universities: universities.map((university) => ({
        name: university.name,
        members: profiles
          .filter(
            (p) =>
              assignmentsFor(p).some(
                (a) =>
                  a.university === university.name && roleNeedsUniversity(a.role)
              ) && p.email !== directorEmail
          )
          .sort((a, b) => campusRoleRank(rolesFor(a)) - campusRoleRank(rolesFor(b)))
          .map((p) =>
            person(
              p.email,
              assignmentsFor(p)
                .filter(
                  (a) =>
                    a.university === university.name && roleNeedsUniversity(a.role)
                )
                .map((a) => a.role)
                .join(", ")
            )
          ),
      })),
    };
  },
});

/** Departments + divisions for a year (signed-in users; admin UI pickers). */
export const yearStructure = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const settings = await ctx.db
      .query("yearSettings")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .unique();
    return {
      divisions: divisions.map((d) => ({
        name: d.name,
        headEmail: d.headEmail ?? null,
      })),
      departments: departments.map((d) => ({
        name: d.name,
        division: d.division,
        headEmail: d.headEmail ?? null,
        colour: d.colour ?? null,
      })),
      universities: universities.map((u) => u.name),
      roles: roles.map((r) => r.name),
      budgetManagerEmail: settings?.budgetManagerEmail ?? null,
      directorApprovalThreshold: settings?.directorApprovalThreshold ?? null,
    };
  },
});
