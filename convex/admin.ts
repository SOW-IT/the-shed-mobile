import { ConvexError, v } from "convex/values";
import {
  FINANCE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  requestCompleted,
  ROLES,
  roleNeedsDepartment,
  rolesNeedUniversity,
  STAFF_ROLE,
} from "../shared/flow";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  currentStaffYear,
  getDepartment,
  getProfile,
  getYearSettings,
  isAdminProfile,
  nextStaffYear,
  optionalEmail,
  requireAdmin,
  requireEmail,
  resolveImportId,
  rolesOf,
} from "./model";

/** Admins may only manage the current staff year and the next one. */
const assertManagedYear = (year: number) => {
  if (year !== currentStaffYear() && year !== nextStaffYear()) {
    throw new ConvexError(
      `You can only manage ${currentStaffYear()} and ${nextStaffYear()}.`
    );
  }
};

/**
 * Assign roles + department/division/university to a user for a year, by
 * email — works before the user has ever signed in. A person can hold
 * multiple roles (e.g. Head of Division AND Head of Department):
 * division-based roles need a division, Student Leaders need a university
 * instead of a department, everything else needs a department. Only admins;
 * ordinary users can never change their own roles or department.
 */
export const setStaffProfile = mutation({
  args: {
    email: v.string(),
    year: v.number(),
    roles: v.array(v.string()),
    department: v.optional(v.string()),
    division: v.optional(v.string()),
    university: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");
    const roles = [...new Set(args.roles)];
    if (roles.length === 0) throw new ConvexError("Pick at least one role.");
    for (const role of roles) {
      if (!ROLES.includes(role as (typeof ROLES)[number])) {
        throw new ConvexError(`Roles must be among: ${ROLES.join(", ")}.`);
      }
    }

    // Head roles are managed exclusively through the department/division
    // structure section — they cannot be added or removed via staff profile edits.
    if (roles.includes(HEAD_OF_DEPARTMENT) || roles.includes(HEAD_OF_DIVISION)) {
      throw new ConvexError(
        "Head of Department and Head of Division are assigned through the Structure section — edit the department or division directly to change its head."
      );
    }

    // Staff-side roles trump campus roles: their holders never get a
    // university, so saving also clears any stale one.
    const needsUniversity = rolesNeedUniversity(roles);
    const needsDepartment = roles.some(roleNeedsDepartment);
    let university: string | undefined;
    if (needsUniversity) {
      university = args.university;
      const exists =
        university &&
        (await ctx.db
          .query("universities")
          .withIndex("by_year_and_name", (q) =>
            q.eq("year", args.year).eq("name", university!)
          )
          .unique());
      if (!exists) {
        throw new ConvexError(
          `Campus roles (Student Leader, President, Vice President, Executive) need a university that exists in ${args.year}.`
        );
      }
    }
    let department: string | undefined;
    if (needsDepartment) {
      department = args.department;
      const exists =
        department && (await getDepartment(ctx, args.year, department));
      if (!exists) {
        throw new ConvexError(
          `Department "${args.department ?? ""}" doesn't exist in ${args.year}.`
        );
      }
    }

    // Moving the Budget Manager out of Finance would violate the rule that
    // the Budget Manager must be from the Finance department.
    if (department !== FINANCE) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail === email) {
        await ctx.db.patch("yearSettings", settings._id, {
          budgetManagerEmail: undefined,
        });
      }
    }

    const existing = await getProfile(ctx, email, args.year);

    // Preserve any head roles assigned through the structure section — they
    // cannot be changed via staff profile edits, only via the department/division
    // mutations which also enforce uniqueness.
    const existingHeadRoles = existing
      ? rolesOf(existing).filter(
          (r) => r === HEAD_OF_DEPARTMENT || r === HEAD_OF_DIVISION
        )
      : [];
    const finalRoles =
      existingHeadRoles.length > 0
        ? [...new Set([...roles, ...existingHeadRoles])]
        : roles;
    // The division field on a profile is managed by the structure section
    // for Heads of Division; preserve whatever it currently is.
    const division = existingHeadRoles.includes(HEAD_OF_DIVISION)
      ? existing?.division
      : undefined;

    let profileId;
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, {
        roles: finalRoles,
        role: undefined, // retire the legacy single-role field
        department,
        division,
        university,
        importId: existing.importId ?? (await resolveImportId(ctx, email)),
      });
      profileId = existing._id;
    } else {
      profileId = await ctx.db.insert("staffProfiles", {
        email,
        year: args.year,
        roles: finalRoles,
        department,
        division,
        university,
        importId: await resolveImportId(ctx, email),
      });
    }
    return profileId;
  },
});

export const removeStaffProfile = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    const profile = await getProfile(ctx, email, args.year);
    if (profile) await ctx.db.delete("staffProfiles", profile._id);
    // Don't leave a removed person assigned as the Budget Manager or as a
    // department head — both would silently deadlock approvals.
    const settings = await getYearSettings(ctx, args.year);
    if (settings?.budgetManagerEmail === email) {
      await ctx.db.patch("yearSettings", settings._id, {
        budgetManagerEmail: undefined,
      });
    }
    const yearDepartments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    for (const dept of yearDepartments) {
      if (dept.headEmail === email) {
        await ctx.db.patch("departments", dept._id, { headEmail: undefined });
      }
    }
    const yearDivisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    for (const div of yearDivisions) {
      if (div.headEmail === email) {
        await ctx.db.patch("divisions", div._id, { headEmail: undefined });
      }
    }
    return null;
  },
});

export const listStaffProfiles = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireAdmin(ctx);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    const directoryUsers = await ctx.db.query("directoryUsers").take(4000);
    const directoryNameByEmail = new Map(
      directoryUsers.map((u) => [u.email, u.name ?? null] as const)
    );
    return profiles.map((profile) => ({
      ...profile,
      roles: rolesOf(profile),
      name: profile.name ?? directoryNameByEmail.get(profile.email) ?? null,
    }));
  },
});

/**
 * People who have signed in with Google but have no role/department for the
 * given year — either we never expected them, or they lapsed at rollover.
 * Lets admins spot and assign them instead of needing the email out-of-band.
 */
export const listUnassignedUsers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    const directoryUsers = await ctx.db.query("directoryUsers").take(4000);
    const directoryNameByEmail = new Map(
      directoryUsers.map((u) => [u.email, u.name ?? null] as const)
    );
    const unassigned: { email: string; name: string | null }[] = [];
    for (const user of users) {
      if (!user.email) continue;
      const profile = await getProfile(ctx, user.email, args.year);
      if (!profile) {
        unassigned.push({
          email: user.email,
          name: user.name ?? directoryNameByEmail.get(user.email) ?? null,
        });
      }
    }
    return unassigned;
  },
});

export const upsertDivision = mutation({
  args: {
    year: v.number(),
    name: v.string(),
    headEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Division name is required.");
    const headEmail = args.headEmail?.trim().toLowerCase() || undefined;
    const existing = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .unique();
    const oldHeadEmail = existing?.headEmail;
    let divisionId;
    if (existing) {
      await ctx.db.patch("divisions", existing._id, { headEmail });
      divisionId = existing._id;
    } else {
      divisionId = await ctx.db.insert("divisions", {
        year: args.year,
        name,
        headEmail,
      });
    }

    // Reverse sync: the head named on a division gets the Head of Division
    // role on their profile — creating the profile if they were never
    // provisioned. Their profile's own division is only set when empty, so
    // heading a second division doesn't move them. If they were previously a
    // dept head, the conflicting role, department field, and headship are cleared.
    if (headEmail) {
      const headProfile = await getProfile(ctx, headEmail, args.year);
      if (headProfile) {
        let roles = [...new Set([...rolesOf(headProfile), HEAD_OF_DIVISION])];
        const wasHeadOfDept = roles.includes(HEAD_OF_DEPARTMENT);
        if (wasHeadOfDept) {
          roles = roles.filter((r) => r !== HEAD_OF_DEPARTMENT);
          const yearDepts = await ctx.db
            .query("departments")
            .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
            .take(200);
          for (const dept of yearDepts) {
            if (dept.headEmail === headEmail) {
              await ctx.db.patch("departments", dept._id, { headEmail: undefined });
            }
          }
          const settings = await getYearSettings(ctx, args.year);
          if (settings?.budgetManagerEmail === headEmail) {
            await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
          }
        }
        await ctx.db.patch("staffProfiles", headProfile._id, {
          roles,
          role: undefined,
          division: headProfile.division ?? name,
          ...(wasHeadOfDept && { department: undefined }),
        });
      } else {
        await ctx.db.insert("staffProfiles", {
          email: headEmail,
          year: args.year,
          roles: [HEAD_OF_DIVISION],
          division: name,
          importId: await resolveImportId(ctx, headEmail),
        });
      }
    }

    // Remove HEAD_OF_DIVISION from the old head if they no longer head any division.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      const yearDivisions = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      const stillHeading = yearDivisions.some((d) => d.headEmail === oldHeadEmail);
      if (!stillHeading) {
        const oldHead = await getProfile(ctx, oldHeadEmail, args.year);
        if (oldHead) {
          const updatedRoles = rolesOf(oldHead).filter((r) => r !== HEAD_OF_DIVISION);
          await ctx.db.patch("staffProfiles", oldHead._id, {
            roles: updatedRoles.length > 0 ? updatedRoles : [STAFF_ROLE],
            role: undefined,
          });
        }
      }
    }

    return divisionId;
  },
});

/**
 * Inline-edit for an existing division: rename (cascading through departments
 * and staff profiles) and/or update the head, all in one atomic transaction.
 */
export const updateDivision = mutation({
  args: {
    year: v.number(),
    oldName: v.string(),
    newName: v.string(),
    headEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const oldName = args.oldName.trim();
    const newName = args.newName.trim();
    if (!newName) throw new ConvexError("Division name is required.");
    const headEmail = args.headEmail?.trim().toLowerCase() || undefined;

    const existing = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", oldName))
      .unique();
    if (!existing) throw new ConvexError(`Division "${oldName}" not found.`);

    const oldHeadEmail = existing.headEmail;

    if (newName !== oldName) {
      const conflict = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", newName))
        .unique();
      if (conflict) throw new ConvexError(`A division named "${newName}" already exists.`);

      await ctx.db.patch("divisions", existing._id, { name: newName, headEmail });

      // Cascade: update departments and staff profiles that reference the old name.
      const departments = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      for (const dept of departments) {
        if (dept.division === oldName) {
          await ctx.db.patch("departments", dept._id, { division: newName });
        }
      }
      // NOTE: capped at 1000 profiles — if the org ever exceeds this in a
      // single year, profiles beyond the cap will silently retain the old
      // division name. Use @convex-dev/migrations for a safe unbounded rename.
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .take(1000);
      for (const profile of profiles) {
        if (profile.division === oldName) {
          await ctx.db.patch("staffProfiles", profile._id, { division: newName });
        }
      }
    } else {
      await ctx.db.patch("divisions", existing._id, { headEmail });
    }

    // Reverse sync: grant HEAD_OF_DIVISION role to new head.
    // If they were previously a dept head, clear the conflicting role, headship, and budget manager.
    if (headEmail) {
      const headProfile = await getProfile(ctx, headEmail, args.year);
      if (headProfile) {
        let roles = [...new Set([...rolesOf(headProfile), HEAD_OF_DIVISION])];
        const wasHeadOfDept = roles.includes(HEAD_OF_DEPARTMENT);
        if (wasHeadOfDept) {
          roles = roles.filter((r) => r !== HEAD_OF_DEPARTMENT);
          const yearDepts = await ctx.db
            .query("departments")
            .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
            .take(200);
          for (const dept of yearDepts) {
            if (dept.headEmail === headEmail) {
              await ctx.db.patch("departments", dept._id, { headEmail: undefined });
            }
          }
          const settings = await getYearSettings(ctx, args.year);
          if (settings?.budgetManagerEmail === headEmail) {
            await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
          }
        }
        await ctx.db.patch("staffProfiles", headProfile._id, {
          roles,
          role: undefined,
          division: headProfile.division ?? newName,
          ...(wasHeadOfDept && { department: undefined }),
        });
      } else {
        await ctx.db.insert("staffProfiles", {
          email: headEmail,
          year: args.year,
          roles: [HEAD_OF_DIVISION],
          division: newName,
          importId: await resolveImportId(ctx, headEmail),
        });
      }
    }

    // Remove HEAD_OF_DIVISION from old head if they no longer head any division.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      const yearDivisions = await ctx.db
        .query("divisions")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      const stillHeading = yearDivisions.some((d) => d.headEmail === oldHeadEmail);
      if (!stillHeading) {
        const oldHead = await getProfile(ctx, oldHeadEmail, args.year);
        if (oldHead) {
          const updatedRoles = rolesOf(oldHead).filter((r) => r !== HEAD_OF_DIVISION);
          await ctx.db.patch("staffProfiles", oldHead._id, {
            roles: updatedRoles.length > 0 ? updatedRoles : [STAFF_ROLE],
            role: undefined,
          });
        }
      }
    }

    return existing._id;
  },
});

export const removeDivision = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const division = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.name)
      )
      .unique();
    if (!division) return null;
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    if (departments.some((d) => d.division === args.name)) {
      throw new ConvexError("Move its departments to another division first.");
    }
    await ctx.db.delete("divisions", division._id);
    return null;
  },
});

export const upsertUniversity = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("University name is required.");
    const existing = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("universities", { year: args.year, name });
  },
});

export const removeUniversity = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const university = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.name)
      )
      .unique();
    if (!university) return null;
    // Don't strand Student Leaders pointing at a university that no longer
    // exists — reassign them first.
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    if (profiles.some((p) => p.university === args.name)) {
      throw new ConvexError(
        `"${args.name}" still has people assigned in ${args.year} — move them to another university first.`
      );
    }
    await ctx.db.delete("universities", university._id);
    return null;
  },
});

export const upsertDepartment = mutation({
  args: {
    year: v.number(),
    name: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()),
    colour: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Department name is required.");
    const division = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.division)
      )
      .unique();
    if (!division) {
      throw new ConvexError(`Division "${args.division}" doesn't exist in ${args.year}.`);
    }
    const headEmail = args.headEmail?.trim().toLowerCase() || undefined;
    const existing = await getDepartment(ctx, args.year, name);
    const oldHeadEmail = existing?.headEmail;
    let departmentId;
    if (existing) {
      await ctx.db.patch("departments", existing._id, {
        division: args.division,
        headEmail,
        colour: args.colour ?? existing.colour,
      });
      departmentId = existing._id;
    } else {
      departmentId = await ctx.db.insert("departments", {
        year: args.year,
        name,
        division: args.division,
        headEmail,
        colour: args.colour,
      });
    }

    // Reverse sync: the head named on a department gets the Head of
    // Department role (and membership) on their profile — creating the
    // profile if they were never provisioned. If they were previously a
    // division head, the conflicting role, division field, and headship are cleared.
    if (headEmail) {
      const headProfile = await getProfile(ctx, headEmail, args.year);
      if (headProfile) {
        let roles = [...new Set([...rolesOf(headProfile), HEAD_OF_DEPARTMENT])];
        const wasHeadOfDiv = roles.includes(HEAD_OF_DIVISION);
        if (wasHeadOfDiv) {
          roles = roles.filter((r) => r !== HEAD_OF_DIVISION);
          const yearDivs = await ctx.db
            .query("divisions")
            .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
            .take(200);
          for (const div of yearDivs) {
            if (div.headEmail === headEmail) {
              await ctx.db.patch("divisions", div._id, { headEmail: undefined });
            }
          }
        }
        await ctx.db.patch("staffProfiles", headProfile._id, {
          roles,
          role: undefined,
          department: name,
          ...(wasHeadOfDiv && { division: undefined }),
        });
      } else {
        await ctx.db.insert("staffProfiles", {
          email: headEmail,
          year: args.year,
          roles: [HEAD_OF_DEPARTMENT],
          department: name,
          importId: await resolveImportId(ctx, headEmail),
        });
      }
    }

    // Remove HEAD_OF_DEPARTMENT from old head if they no longer head any department.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      const yearDepartments = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      const stillHeading = yearDepartments.some((d) => d.headEmail === oldHeadEmail);
      if (!stillHeading) {
        const oldHead = await getProfile(ctx, oldHeadEmail, args.year);
        if (oldHead) {
          const updatedRoles = rolesOf(oldHead).filter((r) => r !== HEAD_OF_DEPARTMENT);
          await ctx.db.patch("staffProfiles", oldHead._id, {
            roles: updatedRoles.length > 0 ? updatedRoles : [STAFF_ROLE],
            role: undefined,
          });
        }
      }
    }

    return departmentId;
  },
});

/**
 * Everyone the org knows about, for admin pickers: provisioned profiles,
 * signed-in users and the synced Workspace directory, deduped by email.
 */
export const people = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireAdmin(ctx);
    const byEmail = new Map<
      string,
      { email: string; name: string | null; department: string | null }
    >();
    const directory = await ctx.db.query("directoryUsers").take(4000);
    for (const user of directory) {
      byEmail.set(user.email, {
        email: user.email,
        name: user.name ?? null,
        department: null,
      });
    }
    const users = await ctx.db.query("users").take(1000);
    for (const user of users) {
      if (!user.email) continue;
      const existing = byEmail.get(user.email);
      byEmail.set(user.email, {
        email: user.email,
        name: user.name ?? existing?.name ?? null,
        department: existing?.department ?? null,
      });
    }
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of profiles) {
      const existing = byEmail.get(profile.email);
      byEmail.set(profile.email, {
        email: profile.email,
        name: existing?.name ?? profile.name ?? null,
        department: profile.department ?? null,
      });
    }
    return [...byEmail.values()].sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email)
    );
  },
});

/**
 * Inline-edit for an existing department: rename (cascading through staff
 * profiles and requests), change division, and/or update the head — all
 * in one atomic transaction.
 */
export const updateDepartment = mutation({
  args: {
    year: v.number(),
    oldName: v.string(),
    newName: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const oldName = args.oldName.trim();
    const newName = args.newName.trim();
    if (!newName) throw new ConvexError("Department name is required.");

    const divisionDoc = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", args.division)
      )
      .unique();
    if (!divisionDoc) {
      throw new ConvexError(`Division "${args.division}" doesn't exist in ${args.year}.`);
    }

    const headEmail = args.headEmail?.trim().toLowerCase() || undefined;
    const existing = await getDepartment(ctx, args.year, oldName);
    if (!existing) throw new ConvexError(`Department "${oldName}" not found.`);

    const oldHeadEmail = existing.headEmail;

    if (newName !== oldName) {
      const conflict = await getDepartment(ctx, args.year, newName);
      if (conflict) throw new ConvexError(`A department named "${newName}" already exists.`);

      // Rename the document and update division + head in one patch.
      await ctx.db.patch("departments", existing._id, {
        name: newName,
        division: args.division,
        headEmail,
      });

      // Cascade: update staff profiles and requests that reference the old name.
      // NOTE: both loops are capped at 1000 — if the org exceeds 1000 profiles
      // or 1000 requests in a single department/year, records beyond the cap
      // will silently retain the old department name. Use @convex-dev/migrations
      // for a safe unbounded rename at that scale.
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .take(1000);
      for (const profile of profiles) {
        if (profile.department === oldName) {
          await ctx.db.patch("staffProfiles", profile._id, { department: newName });
        }
      }
      const requests = await ctx.db
        .query("requests")
        .withIndex("by_year_and_department", (q) =>
          q.eq("year", args.year).eq("department", oldName)
        )
        .take(1000);
      for (const request of requests) {
        await ctx.db.patch("requests", request._id, { department: newName });
      }
    } else {
      await ctx.db.patch("departments", existing._id, {
        division: args.division,
        headEmail,
      });
    }

    // Reverse sync: grant HEAD_OF_DEPARTMENT role to new head.
    // If they were previously a division head, clear the conflicting role, division field, and headship.
    if (headEmail) {
      const headProfile = await getProfile(ctx, headEmail, args.year);
      if (headProfile) {
        let roles = [...new Set([...rolesOf(headProfile), HEAD_OF_DEPARTMENT])];
        const wasHeadOfDiv = roles.includes(HEAD_OF_DIVISION);
        if (wasHeadOfDiv) {
          roles = roles.filter((r) => r !== HEAD_OF_DIVISION);
          const yearDivs = await ctx.db
            .query("divisions")
            .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
            .take(200);
          for (const div of yearDivs) {
            if (div.headEmail === headEmail) {
              await ctx.db.patch("divisions", div._id, { headEmail: undefined });
            }
          }
        }
        await ctx.db.patch("staffProfiles", headProfile._id, {
          roles,
          role: undefined,
          department: newName,
          ...(wasHeadOfDiv && { division: undefined }),
        });
      } else {
        await ctx.db.insert("staffProfiles", {
          email: headEmail,
          year: args.year,
          roles: [HEAD_OF_DEPARTMENT],
          department: newName,
          importId: await resolveImportId(ctx, headEmail),
        });
      }
    }

    // Remove HEAD_OF_DEPARTMENT from old head if they no longer head any department.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      const yearDepartments = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      const stillHeading = yearDepartments.some((d) => d.headEmail === oldHeadEmail);
      if (!stillHeading) {
        const oldHead = await getProfile(ctx, oldHeadEmail, args.year);
        if (oldHead) {
          const updatedRoles = rolesOf(oldHead).filter((r) => r !== HEAD_OF_DEPARTMENT);
          await ctx.db.patch("staffProfiles", oldHead._id, {
            roles: updatedRoles.length > 0 ? updatedRoles : [STAFF_ROLE],
            role: undefined,
          });
        }
      }
    }

    return existing._id;
  },
});

export const removeDepartment = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const department = await getDepartment(ctx, args.year, args.name);
    if (!department) return null;

    // Deleting a department that people or in-flight requests still point at
    // would silently strand them (invisible, unapprovable). Refuse instead.
    const members = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year_and_department", (q) =>
        q.eq("year", args.year).eq("department", args.name)
      )
      .take(1);
    if (members.length > 0) {
      throw new ConvexError(
        `"${args.name}" still has staff assigned in ${args.year} — move them to another department first.`
      );
    }
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_year_and_department", (q) =>
        q.eq("year", args.year).eq("department", args.name)
      )
      .take(200);
    if (requests.some((request) => !requestCompleted(request))) {
      throw new ConvexError(
        `"${args.name}" still has open requests in ${args.year} — complete or cancel them first.`
      );
    }

    await ctx.db.delete("departments", department._id);
    return null;
  },
});

/** The Budget Manager must be a member of the Finance department that year. */
export const setBudgetManager = mutation({
  args: { year: v.number(), email: v.string() },
  handler: async (ctx, args) => {
    assertManagedYear(args.year);
    // Allow admins OR the Finance Head (Head of Finance department).
    const callerEmail = await requireEmail(ctx);
    const callerProfile = await getProfile(ctx, callerEmail, args.year);
    if (!callerProfile) throw new ConvexError("No profile found for your account.");
    const isAdmin = await isAdminProfile(ctx, callerProfile);
    if (!isAdmin) {
      const financeDept = await getDepartment(ctx, args.year, FINANCE);
      if (financeDept?.headEmail !== callerEmail) {
        throw new ConvexError(
          "Only admins or the Finance Head can set the Budget Manager."
        );
      }
    }
    const email = args.email.trim().toLowerCase();
    const profile = await getProfile(ctx, email, args.year);
    if (!profile || profile.department !== FINANCE) {
      throw new ConvexError(
        `The Budget Manager must be from the ${FINANCE} department in ${args.year}.`
      );
    }
    const settings = await getYearSettings(ctx, args.year);
    if (settings) {
      await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: email });
      return settings._id;
    }
    return await ctx.db.insert("yearSettings", {
      year: args.year,
      budgetManagerEmail: email,
    });
  },
});

/**
 * Finance department members for the Budget Manager picker — accessible to
 * the Finance Head and admins (not exposed to general staff).
 */
export const financeMembers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const callerEmail = await optionalEmail(ctx);
    if (!callerEmail) return null;
    const callerProfile = await getProfile(ctx, callerEmail, args.year);
    if (!callerProfile) return null;
    const isAdmin = await isAdminProfile(ctx, callerProfile);
    if (!isAdmin) {
      const financeDept = await getDepartment(ctx, args.year, FINANCE);
      if (financeDept?.headEmail !== callerEmail) return null;
    }
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year_and_department", (q) =>
        q.eq("year", args.year).eq("department", FINANCE)
      )
      .take(100);
    return profiles.map((p) => ({ email: p.email, name: p.name ?? null }));
  },
});

/**
 * One-off cleanup for the rule that staff-side roles (Staff, Heads, Director,
 * chaplains) never carry a university: strips the field from every existing
 * profile the rule applies to, across all years.
 * Run with: npx convex run admin:clearStaffUniversities
 */
export const clearStaffUniversities = internalMutation({
  args: {},
  handler: async (ctx) => {
    let cleared = 0;
    const profiles = await ctx.db.query("staffProfiles").take(8000);
    for (const profile of profiles) {
      if (profile.university && !rolesNeedUniversity(rolesOf(profile))) {
        await ctx.db.patch("staffProfiles", profile._id, { university: undefined });
        cleared++;
      }
    }
    return { cleared };
  },
});

/**
 * Replaces one year's divisions, departments, staff profiles and settings
 * with a copy of another year's — e.g. provisioning next year from the
 * current one at rollover.
 * Run with: npx convex run admin:copyYear '{"from":2026,"to":2027}'
 */
export const copyYear = internalMutation({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    if (args.from === args.to) throw new ConvexError("from and to must differ.");
    const counts = { divisions: 0, departments: 0, profiles: 0, budgetManagers: 0 };

    const oldDivisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.to))
      .take(200);
    for (const division of oldDivisions) await ctx.db.delete("divisions", division._id);
    const oldDepartments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.to))
      .take(200);
    for (const department of oldDepartments) {
      await ctx.db.delete("departments", department._id);
    }
    const oldProfiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.to))
      .take(2000);
    for (const profile of oldProfiles) await ctx.db.delete("staffProfiles", profile._id);

    const divisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.from))
      .take(200);
    for (const division of divisions) {
      await ctx.db.insert("divisions", { year: args.to, name: division.name });
      counts.divisions++;
    }
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.from))
      .take(200);
    for (const department of departments) {
      await ctx.db.insert("departments", {
        year: args.to,
        name: department.name,
        division: department.division,
        headEmail: department.headEmail,
        colour: department.colour,
      });
      counts.departments++;
    }
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.from))
      .take(50);
    for (const university of universities) {
      const existing = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", args.to).eq("name", university.name)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("universities", { year: args.to, name: university.name });
      }
    }
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.from))
      .take(2000);
    for (const profile of profiles) {
      await ctx.db.insert("staffProfiles", {
        email: profile.email,
        year: args.to,
        roles: rolesOf(profile),
        department: profile.department,
        division: profile.division,
        university: profile.university,
        name: profile.name,
        userId: profile.userId,
        importId: profile.importId,
      });
      counts.profiles++;
    }

    const fromSettings = await getYearSettings(ctx, args.from);
    if (fromSettings?.budgetManagerEmail) {
      const toSettings = await getYearSettings(ctx, args.to);
      if (toSettings) {
        await ctx.db.patch("yearSettings", toSettings._id, {
          budgetManagerEmail: fromSettings.budgetManagerEmail,
        });
      } else {
        await ctx.db.insert("yearSettings", {
          year: args.to,
          budgetManagerEmail: fromSettings.budgetManagerEmail,
        });
      }
      counts.budgetManagers++;
    }

    return counts;
  },
});

/** SOW's organisation structure: division -> departments. */
const ORG_STRUCTURE: Record<string, string[]> = {
  Governance: ["Data and IT", FINANCE, "Compliance"],
  Engagement: ["Marketing", "Alumni"],
  "Human Resources": ["People and Culture", "Training and Development"],
  Operations: ["Events", "Missions"],
};

/** Universities with a SOW campus presence (Student Leaders belong to one). */
const UNIVERSITIES = [
  "Macquarie University",
  "University of New South Wales",
  "University of Sydney",
  "University of Technology, Sydney",
];

/**
 * Bootstrap: replaces the current staff year's divisions/departments with the
 * SOW org structure (preserving department heads where names match) and makes
 * `adminEmail` an admin (Data and IT).
 * Run with: npx convex run admin:seed '{"adminEmail":"you@sow.org.au"}'
 */
export const seed = internalMutation({
  args: { adminEmail: v.string() },
  handler: async (ctx, args) => {
    const year = currentStaffYear();
    const email = args.adminEmail.trim().toLowerCase();

    const oldDepartments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const headsByName: Record<string, string | undefined> = {};
    const coloursByName: Record<string, string | undefined> = {};
    for (const department of oldDepartments) {
      headsByName[department.name] = department.headEmail;
      coloursByName[department.name] = department.colour;
      await ctx.db.delete("departments", department._id);
    }
    const oldDivisions = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", year))
      .take(200);
    const divisionHeadsByName: Record<string, string | undefined> = {};
    for (const division of oldDivisions) {
      divisionHeadsByName[division.name] = division.headEmail;
      await ctx.db.delete("divisions", division._id);
    }

    for (const [division, departments] of Object.entries(ORG_STRUCTURE)) {
      await ctx.db.insert("divisions", {
        year,
        name: division,
        headEmail: divisionHeadsByName[division],
      });
      for (const name of departments) {
        await ctx.db.insert("departments", {
          year,
          name,
          division,
          headEmail: headsByName[name],
          colour: coloursByName[name],
        });
      }
    }

    for (const name of UNIVERSITIES) {
      const existing = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
        .unique();
      if (!existing) {
        await ctx.db.insert("universities", { year, name });
      }
    }

    const profile = await getProfile(ctx, email, year);
    if (!profile) {
      await ctx.db.insert("staffProfiles", {
        email,
        year,
        roles: [STAFF_ROLE],
        department: "Data and IT",
      });
    }
    return { year, admin: email };
  },
});
