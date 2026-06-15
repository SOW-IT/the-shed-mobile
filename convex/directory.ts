import { v } from "convex/values";
import {
  assignmentsOf,
  departmentsOf,
  DIRECTOR,
  divisionsOf,
  FINANCE,
  HEAD_OF_DIVISION,
  isHeadOfDivisionName,
  isMemberOfDepartment,
  roleNeedsUniversity,
  rolesForDepartment,
} from "../shared/flow";
import { query } from "./_generated/server";
import {
  currentStaffYear,
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
    const photo = user?.avatarId
      ? await ctx.storage.getUrl(user.avatarId)
      : (user?.image ?? null);
    const profile = await getProfile(ctx, email, year);
    const dirUser = await ctx.db
      .query("directoryUsers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const name = user?.name ?? profile?.name ?? dirUser?.name ?? null;
    if (!profile) {
      return { email, year, name, photo, profile: null };
    }
    const approvers = await getApprovers(
      ctx,
      year,
      profile.department ?? profile.division ?? ""
    );
    const headedDepartments = (await departmentsHeadedBy(ctx, year, email)).map(
      (d) => d.name
    );
    return {
      email,
      year,
      name,
      photo,
      profile: {
        roles: rolesOf(profile),
        assignments: assignmentsOf(profile),
        // Legacy singles kept for back-compat; prefer departments/divisions.
        department: profile.department ?? null,
        division: profile.division ?? null,
        departments: departmentsOf(profile),
        divisions: divisionsOf(profile),
      },
      isAdmin: await isAdminProfile(ctx, profile),
      isFinance: isMemberOfDepartment(profile, FINANCE),
      isDirector: rolesOf(profile).includes(DIRECTOR),
      isBudgetManager: approvers.budgetManagerEmail === email,
      isFinanceHead: approvers.financeHeadEmail === email,
      headedDepartments,
      isApprover:
        headedDepartments.some((d) => d !== FINANCE) ||
        approvers.budgetManagerEmail === email ||
        approvers.financeHeadEmail === email ||
        rolesOf(profile).includes(DIRECTOR),
    };
  },
});

/** Resolves a display name for any staff email — used on request cards. */
export const nameForEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const year = currentStaffYear();
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
    const directoryNameByEmail = new Map(
      directoryUsers.map((u) => [u.email, u.name ?? null] as const)
    );

    const nameByEmail: Record<string, string | null> = {};
    const photoByEmail: Record<string, string | null> = {};
    for (const profile of profiles) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", profile.email))
        .first();
      nameByEmail[profile.email] =
        user?.name ?? profile.name ?? directoryNameByEmail.get(profile.email) ?? null;
      // A custom uploaded photo beats the Google default.
      photoByEmail[profile.email] = user?.avatarId
        ? await ctx.storage.getUrl(user.avatarId)
        : (user?.image ?? null);
    }
    const person = (email: string, role?: string) => ({
      email,
      name: nameByEmail[email] ?? null,
      photo: photoByEmail[email] ?? null,
      role: role ?? null,
    });

    const directorProfile =
      profiles.find((p) => rolesOf(p).includes(DIRECTOR)) ?? null;

    return {
      year,
      availableYears,
      director: directorProfile
        ? person(directorProfile.email, DIRECTOR)
        : null,
      divisions: divisions.map((division) => {
        // The head named on the division wins (one person can head several);
        // fall back to a profile whose assignments head this division.
        const divisionHead =
          division.headEmail ??
          profiles.find((p) => isHeadOfDivisionName(p, division.name))?.email;
        return {
          name: division.name,
          head: divisionHead ? person(divisionHead, HEAD_OF_DIVISION) : null,
          departments: departments
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
                    isMemberOfDepartment(p, department.name) &&
                    p.email !== department.headEmail &&
                    !rolesOf(p).includes(DIRECTOR)
                )
                .map((p) =>
                  person(p.email, rolesForDepartment(p, department.name).join(", "))
                ),
            })),
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
              assignmentsOf(p).some(
                (a) =>
                  a.university === university.name && roleNeedsUniversity(a.role)
              ) && !rolesOf(p).includes(DIRECTOR)
          )
          .sort((a, b) => campusRoleRank(rolesOf(a)) - campusRoleRank(rolesOf(b)))
          .map((p) =>
            person(
              p.email,
              assignmentsOf(p)
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
      budgetManagerEmail: settings?.budgetManagerEmail ?? null,
    };
  },
});
