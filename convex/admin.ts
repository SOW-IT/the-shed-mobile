import { ConvexError, v } from "convex/values";
import {
  Assignment,
  assignmentFor,
  assignmentsOf,
  CHAPLAINCY_DEPARTMENT,
  dedupeAssignments,
  departmentsOf,
  DIRECTOR,
  FINANCE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isChaplainRole,
  isMemberOfDepartment,
  MEMBER,
  requestCompleted,
  ROLES,
  roleNeedsDepartment,
  roleNeedsUniversity,
  rolesNeedUniversity,
  STAFF_ROLE,
  STAFF_SIDE_ROLES,
} from "../shared/flow";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx, mutation, query } from "./_generated/server";
import { IMPORT_DATA } from "./importData";
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

/** The role names assignable in a given year: the year's data-driven catalog, or the built-in ROLES when none exists yet. */
const allowedRolesForYear = async (ctx: MutationCtx, year: number): Promise<Set<string>> => {
  const rows = await ctx.db.query("roles").withIndex("by_year_and_name", (q) => q.eq("year", year)).take(500);
  return rows.length > 0 ? new Set(rows.map((r) => r.name)) : new Set<string>(ROLES);
};

// ---------------------------------------------------------------------------
// Head reverse-sync helpers — keep a profile's assignments (and the legacy
// single-scope fields) in step with the authoritative department/division
// headEmail. Heads remain owned by the structure section; these never derive
// headEmail from a profile.
// ---------------------------------------------------------------------------

const isHeadRole = (role: string): boolean =>
  role === HEAD_OF_DEPARTMENT || role === HEAD_OF_DIVISION;

/** Patch a profile from a final assignment set. `assignments` is the source of truth. */
const patchFromAssignments = async (
  ctx: MutationCtx,
  profile: Doc<"staffProfiles">,
  assignments: Assignment[]
) => {
  await ctx.db.patch("staffProfiles", profile._id, {
    assignments: dedupeAssignments(assignments),
  });
};

/**
 * Grant a head role for one specific department/division, mirroring the
 * authoritative headEmail onto the person's profile (creating it if missing).
 * Scope-specific supersede: a non-head link to the *same* department is dropped
 * (you needn't be both Staff and Head of the same dept); links to other
 * departments, divisions and campuses are preserved, so "Staff of A + Head of
 * B" survives. A person may hold both HOD and HODiv at once.
 */
const grantHead = async (
  ctx: MutationCtx,
  year: number,
  email: string,
  role: typeof HEAD_OF_DEPARTMENT | typeof HEAD_OF_DIVISION,
  scopeName: string
) => {
  const headAssignment: Assignment =
    role === HEAD_OF_DEPARTMENT
      ? { role, department: scopeName }
      : { role, division: scopeName };
  const profile = await getProfile(ctx, email, year);
  if (!profile) {
    await ctx.db.insert("staffProfiles", {
      email,
      year,
      assignments: [headAssignment],
      importId: await resolveImportId(ctx, email),
    });
    return;
  }
  const kept = assignmentsOf(profile).filter((a) => {
    if (a.role === role) {
      // Drop an existing head link for this same scope (re-added canonically).
      const existingScope =
        role === HEAD_OF_DEPARTMENT ? a.department : a.division;
      return existingScope !== scopeName;
    }
    // Supersede a non-head link scoped to this same department.
    if (role === HEAD_OF_DEPARTMENT && !isHeadRole(a.role) && a.department === scopeName) {
      return false;
    }
    return true;
  });
  await patchFromAssignments(ctx, profile, [...kept, headAssignment]);
};

/**
 * Revoke a head role for one specific department/division from a person — used
 * when a headship moves to someone else. Removes only that one head link;
 * other head links and memberships stay. Falls back to a plain Staff link if
 * the person ends up with no assignments at all.
 */
const revokeHead = async (
  ctx: MutationCtx,
  year: number,
  email: string,
  role: typeof HEAD_OF_DEPARTMENT | typeof HEAD_OF_DIVISION,
  scopeName: string
) => {
  const profile = await getProfile(ctx, email, year);
  if (!profile) return;
  const scopeKey = role === HEAD_OF_DEPARTMENT ? "department" : "division";
  const remaining = assignmentsOf(profile).filter(
    (a) => !(a.role === role && a[scopeKey] === scopeName)
  );
  const finalAssignments =
    remaining.length > 0 ? remaining : [{ role: STAFF_ROLE }];
  await patchFromAssignments(ctx, profile, finalAssignments);
};

/** Remap a department/division rename across a profile's assignment scopes. */
const remapScope = (
  assignments: Assignment[],
  key: "department" | "division" | "university",
  oldName: string,
  newName: string
): Assignment[] =>
  assignments.map((a) => (a[key] === oldName ? { ...a, [key]: newName } : a));

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
    roles: v.optional(v.array(v.string())),
    department: v.optional(v.string()),
    division: v.optional(v.string()),
    university: v.optional(v.string()),
    assignments: v.optional(
      v.array(
        v.object({
          role: v.string(),
          department: v.optional(v.string()),
          division: v.optional(v.string()),
          university: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) throw new ConvexError("Enter a valid email.");

    if (args.assignments !== undefined) {
      // ——— Per-assignment path (new UI) ———
      const drafts = args.assignments;
      if (drafts.length === 0) throw new ConvexError("Add at least one assignment.");

      const existing = await getProfile(ctx, email, args.year);
      const existingHeadRoles = existing ? rolesOf(existing).filter(isHeadRole) : [];

      const allowed = await allowedRolesForYear(ctx, args.year);
      for (const a of drafts) {
        if (!allowed.has(a.role)) {
          throw new ConvexError(`Roles must be among the roles available for ${args.year}.`);
        }
        // Head roles are owned by the Structure section. A head role the person
        // ALREADY holds may be round-tripped by the form (e.g. when adding a
        // Staff link) and is preserved untouched — only block NEWLY granting one.
        if (isHeadRole(a.role) && !existingHeadRoles.includes(a.role)) {
          throw new ConvexError(
            "Head of Department and Head of Division are assigned through the Structure section — edit the department or division directly to change its head."
          );
        }
      }

      const submittedRoles = [...new Set(drafts.map((a) => a.role))];

      if (submittedRoles.includes(DIRECTOR)) {
        const yearProfiles = await ctx.db
          .query("staffProfiles")
          .withIndex("by_year", (q) => q.eq("year", args.year))
          .take(1000);
        const existingDirector = yearProfiles.find(
          (p) => p.email !== email && rolesOf(p).includes(DIRECTOR)
        );
        if (existingDirector) {
          throw new ConvexError(
            `${existingDirector.email} is already the Director for ${args.year} — there can only be one.`
          );
        }
      }

      const builtAssignments: Assignment[] = [];
      for (const draft of drafts) {
        // A round-tripped head role is preserved from the mirror below, never
        // rebuilt from the form (which would fabricate an unbacked head link).
        if (isHeadRole(draft.role)) continue;
        const built = assignmentFor(draft.role, {
          department: draft.department,
          university: draft.university,
        });
        if (built.department && built.department !== CHAPLAINCY_DEPARTMENT) {
          const exists = await getDepartment(ctx, args.year, built.department);
          if (!exists) {
            throw new ConvexError(
              `Department "${built.department}" doesn't exist in ${args.year}.`
            );
          }
        }
        if (isChaplainRole(draft.role)) {
          const chaplaincy = await getDepartment(ctx, args.year, CHAPLAINCY_DEPARTMENT);
          if (!chaplaincy) {
            throw new ConvexError(
              `The "${CHAPLAINCY_DEPARTMENT}" department doesn't exist in ${args.year} — create it first.`
            );
          }
        }
        if (built.university) {
          const exists = await ctx.db
            .query("universities")
            .withIndex("by_year_and_name", (q) =>
              q.eq("year", args.year).eq("name", built.university!)
            )
            .unique();
          if (!exists) {
            throw new ConvexError(
              `University "${built.university}" doesn't exist in ${args.year}.`
            );
          }
        }
        if (roleNeedsUniversity(draft.role) && !built.university) {
          throw new ConvexError(
            `Campus roles (Student Leader, President, Vice President, Executive) need a university that exists in ${args.year}.`
          );
        }
        if (roleNeedsDepartment(draft.role) && !isChaplainRole(draft.role) && !built.department) {
          throw new ConvexError(`${draft.role} needs a department.`);
        }
        builtAssignments.push(built);
      }

      if (existing && existingHeadRoles.length === 0) {
        const currentRoles = rolesOf(existing);
        const isPureReduction =
          submittedRoles.every((r) => currentRoles.includes(r)) &&
          currentRoles.some((r) => !submittedRoles.includes(r));
        if (isPureReduction) {
          throw new ConvexError(
            "Roles can only be removed from users who hold a Head of Department or Head of Division position."
          );
        }
      }

      const preservedHead = existing
        ? assignmentsOf(existing).filter((a) => isHeadRole(a.role))
        : [];
      const headedDepts = new Set(
        preservedHead
          .filter((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
          .map((a) => a.department)
      );
      const submittedKept = builtAssignments.filter(
        (a) => !(a.department && headedDepts.has(a.department))
      );
      const assignments = dedupeAssignments([...submittedKept, ...preservedHead]);

      if (!assignments.some((a) => a.department === FINANCE)) {
        const settings = await getYearSettings(ctx, args.year);
        if (settings?.budgetManagerEmail === email) {
          await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
        }
      }

      if (existing) {
        await ctx.db.patch("staffProfiles", existing._id, {
          assignments,
          importId: existing.importId ?? (await resolveImportId(ctx, email)),
        });
        return existing._id;
      } else {
        return await ctx.db.insert("staffProfiles", {
          email,
          year: args.year,
          assignments,
          importId: await resolveImportId(ctx, email),
        });
      }
    }

    // ——— Legacy roles path (unchanged) ———
    const roles = [...new Set(args.roles ?? [])];
    if (roles.length === 0) throw new ConvexError("Pick at least one role.");
    const allowed = await allowedRolesForYear(ctx, args.year);
    for (const role of roles) {
      if (!allowed.has(role)) {
        throw new ConvexError(`Roles must be among the roles available for ${args.year}.`);
      }
    }

    const existing = await getProfile(ctx, email, args.year);
    const existingHeadRoles = existing
      ? rolesOf(existing).filter(isHeadRole)
      : [];

    // Head roles are owned by the Structure section. A head role the person
    // ALREADY holds may appear in the submitted list and is preserved untouched
    // — only block NEWLY granting a head role through a staff-profile edit.
    if (roles.some((r) => isHeadRole(r) && !existingHeadRoles.includes(r))) {
      throw new ConvexError(
        "Head of Department and Head of Division are assigned through the Structure section — edit the department or division directly to change its head."
      );
    }

    // Only one Director per year.
    if (roles.includes(DIRECTOR)) {
      const yearProfiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .take(1000);
      const existingDirector = yearProfiles.find(
        (p) => p.email !== email && rolesOf(p).includes(DIRECTOR)
      );
      if (existingDirector) {
        throw new ConvexError(
          `${existingDirector.email} is already the Director for ${args.year} — there can only be one.`
        );
      }
    }

    // Scope validation considers only the submitted NON-head roles — a
    // round-tripped head role the person already holds is preserved from the
    // authoritative mirror and must not drive department/university checks.
    const nonHeadRoles = roles.filter((r) => !isHeadRole(r));
    // Staff-side roles trump campus roles: their holders never get a
    // university, so saving also clears any stale one.
    const needsUniversity = rolesNeedUniversity(nonHeadRoles);
    // Staff, HOD and HODiv never carry a university — all other roles
    // (Chaplains, Director, campus roles) may optionally or necessarily have one.
    const hasBlockingRole = STAFF_SIDE_ROLES.some((r) => nonHeadRoles.includes(r));
    let university: string | undefined;
    if (!hasBlockingRole) {
      const raw = args.university?.trim();
      if (raw) {
        const exists = await ctx.db
          .query("universities")
          .withIndex("by_year_and_name", (q) =>
            q.eq("year", args.year).eq("name", raw)
          )
          .unique();
        if (!exists) {
          throw new ConvexError(
            `University "${raw}" doesn't exist in ${args.year}.`
          );
        }
        university = raw;
      } else if (needsUniversity) {
        throw new ConvexError(
          `Campus roles (Student Leader, President, Vice President, Executive) need a university that exists in ${args.year}.`
        );
      }
    }
    // Chaplains are always attached to the Chaplaincy department, never an
    // admin-picked one. Every other department-scoped role (Staff, Director,
    // Outsource) shares the one department the admin picked.
    const hasChaplain = nonHeadRoles.some(isChaplainRole);
    const needsPickedDepartment = nonHeadRoles.some(
      (r) => roleNeedsDepartment(r) && !isChaplainRole(r)
    );
    let department: string | undefined;
    if (needsPickedDepartment) {
      department = args.department;
      const exists =
        department && (await getDepartment(ctx, args.year, department));
      if (!exists) {
        throw new ConvexError(
          `Department "${args.department ?? ""}" doesn't exist in ${args.year}.`
        );
      }
    }
    if (hasChaplain) {
      const chaplaincy = await getDepartment(ctx, args.year, CHAPLAINCY_DEPARTMENT);
      if (!chaplaincy) {
        throw new ConvexError(
          `The "${CHAPLAINCY_DEPARTMENT}" department doesn't exist in ${args.year} — create it first.`
        );
      }
    }

    // Roles may only be stripped (removed without adding a replacement) from
    // a user who holds a head role. A complete swap (e.g. Director → Staff)
    // is always allowed; only a pure subset reduction is guarded.
    if (existing && existingHeadRoles.length === 0) {
      const currentRoles = rolesOf(existing);
      const isPureReduction =
        roles.every((r) => currentRoles.includes(r)) &&
        currentRoles.some((r) => !roles.includes(r));
      if (isPureReduction) {
        throw new ConvexError(
          "Roles can only be removed from users who hold a Head of Department or Head of Division position."
        );
      }
    }

    // Build the per-role scope links for the submitted NON-head roles. The
    // admin form supplies one department + one university; chaplains override
    // their department to "Chaplaincy" (handled by assignmentFor). Head roles
    // are never fabricated here — they come from the preserved mirror below.
    const submitted = nonHeadRoles.map((role) =>
      assignmentFor(role, { department, university })
    );
    // Head links are owned by the Structure section — preserve them verbatim.
    const preservedHead = existing
      ? assignmentsOf(existing).filter((a) => isHeadRole(a.role))
      : [];
    // A submitted non-head link to a department this person already heads is
    // superseded by the headship (don't list them as both head and member).
    const headedDepts = new Set(
      preservedHead
        .filter((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
        .map((a) => a.department)
    );
    const submittedKept = submitted.filter(
      (a) => !(a.department && headedDepts.has(a.department))
    );
    const assignments = dedupeAssignments([...submittedKept, ...preservedHead]);

    // Moving the Budget Manager out of Finance would violate the rule that the
    // Budget Manager must be a member of the Finance department.
    if (!assignments.some((a) => a.department === FINANCE)) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail === email) {
        await ctx.db.patch("yearSettings", settings._id, {
          budgetManagerEmail: undefined,
        });
      }
    }

    let profileId;
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, {
        assignments,
        importId: existing.importId ?? (await resolveImportId(ctx, email)),
      });
      profileId = existing._id;
    } else {
      profileId = await ctx.db.insert("staffProfiles", {
        email,
        year: args.year,
        assignments,
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
      assignments: assignmentsOf(profile),
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

    // Reverse sync: the head named on a division gets a Head of Division
    // assignment for it, mirroring the authoritative headEmail. Memberships of
    // other departments/divisions are preserved, so heading a second division
    // (or being Staff elsewhere) still works.
    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DIVISION, name);
    }

    // Drop the old head's Head-of-Division link for this division only.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DIVISION, name);
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
        const current = assignmentsOf(profile);
        const referencesOld = current.some((a) => a.division === oldName);
        if (referencesOld) {
          const remapped = remapScope(current, "division", oldName, newName);
          await ctx.db.patch("staffProfiles", profile._id, { assignments: remapped });
        }
      }
    } else {
      await ctx.db.patch("divisions", existing._id, { headEmail });
    }

    // Reverse sync: grant the Head of Division link to the new head; revoke it
    // from the old head (this division only). Other memberships are preserved.
    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DIVISION, newName);
    }
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DIVISION, newName);
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

    // Cascade: collect all departments belonging to this division.
    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const divDepts = departments.filter((d) => d.division === args.name);
    const deptNames = new Set(divDepts.map((d) => d.name));

    // Open requests in any child department would become orphaned — refuse.
    for (const dept of divDepts) {
      const requests = await ctx.db
        .query("requests")
        .withIndex("by_year_and_department", (q) =>
          q.eq("year", args.year).eq("department", dept.name)
        )
        .take(200);
      if (requests.some((r) => !requestCompleted(r))) {
        throw new ConvexError(
          `"${dept.name}" still has open requests in ${args.year} — complete or cancel them first.`
        );
      }
    }

    // Strip all assignments referencing this division or any of its departments
    // in one pass (covers HODiv, HOD, and regular staff assignments).
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of profiles) {
      const current = assignmentsOf(profile);
      const filtered = current.filter(
        (a) => a.division !== args.name && !deptNames.has(a.department ?? "")
      );
      if (filtered.length !== current.length) {
        await patchFromAssignments(ctx, profile, filtered);
      }
    }

    // Delete the departments and the division itself.
    // Clear the budget manager when Finance is among the deleted departments.
    if (deptNames.has(FINANCE)) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail) {
        await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
      }
    }
    for (const dept of divDepts) {
      await ctx.db.delete("departments", dept._id);
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

export const updateUniversity = mutation({
  args: { year: v.number(), oldName: v.string(), newName: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const oldName = args.oldName.trim();
    const newName = args.newName.trim();
    if (!newName) throw new ConvexError("University name is required.");

    const existing = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", oldName))
      .unique();
    if (!existing) throw new ConvexError(`University "${oldName}" not found.`);

    if (newName !== oldName) {
      const conflict = await ctx.db
        .query("universities")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", newName))
        .unique();
      if (conflict) throw new ConvexError(`A university named "${newName}" already exists.`);

      await ctx.db.patch("universities", existing._id, { name: newName });

      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .take(1000);
      for (const profile of profiles) {
        const current = assignmentsOf(profile);
        const referencesOld = current.some((a) => a.university === oldName);
        if (referencesOld) {
          const remapped = remapScope(current, "university", oldName, newName);
          await ctx.db.patch("staffProfiles", profile._id, { assignments: remapped });
        }
      }
    }

    return existing._id;
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
    // Cascade: strip all assignments pointing to this university from staff profiles.
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of profiles) {
      const current = assignmentsOf(profile);
      const filtered = current.filter((a) => a.university !== args.name);
      if (filtered.length !== current.length) {
        await patchFromAssignments(ctx, profile, filtered);
      }
    }
    await ctx.db.delete("universities", university._id);
    return null;
  },
});

/** Roles with hardcoded semantics elsewhere (heads, director, staff fallback, member scope) — renaming/deleting them would break invariants. */
const RESERVED_SYSTEM_ROLES = new Set<string>([HEAD_OF_DEPARTMENT, HEAD_OF_DIVISION, DIRECTOR, STAFF_ROLE, MEMBER]);

export const upsertRole = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Role name is required.");
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("roles", { year: args.year, name });
  },
});

export const updateRole = mutation({
  args: { year: v.number(), oldName: v.string(), newName: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const oldName = args.oldName.trim();
    const newName = args.newName.trim();
    if (!newName) throw new ConvexError("Role name is required.");
    if (RESERVED_SYSTEM_ROLES.has(oldName) || RESERVED_SYSTEM_ROLES.has(newName)) {
      throw new ConvexError("This role is managed by the app and can't be renamed.");
    }

    const existing = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", oldName))
      .unique();
    if (!existing) throw new ConvexError(`Role "${oldName}" not found.`);

    if (newName !== oldName) {
      const conflict = await ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", newName))
        .unique();
      if (conflict) throw new ConvexError(`A role named "${newName}" already exists.`);

      await ctx.db.patch("roles", existing._id, { name: newName });

      // Cascade: rename the role across that year's staff assignments.
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .take(1000);
      if (profiles.length === 1000) {
        throw new ConvexError("Too many profiles to update in one go for this year; this needs a paginated migration.");
      }
      for (const profile of profiles) {
        const current = assignmentsOf(profile);
        if (current.some((a) => a.role === oldName)) {
          const remapped = current.map((a) =>
            a.role === oldName ? { ...a, role: newName } : a
          );
          await patchFromAssignments(ctx, profile, remapped);
        }
      }
    }

    return existing._id;
  },
});

export const removeRole = mutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    const name = args.name.trim();
    if (RESERVED_SYSTEM_ROLES.has(name)) {
      throw new ConvexError("This role is managed by the app and can't be deleted.");
    }
    const role = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", args.year).eq("name", name)
      )
      .unique();
    if (!role) return null;
    // Block deletion while anyone that year still holds this role — the
    // assignment must be reassigned first rather than silently dropped.
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    if (profiles.length === 1000) {
      throw new ConvexError("Too many profiles to update in one go for this year; this needs a paginated migration.");
    }
    const inUse = profiles.filter((p) =>
      assignmentsOf(p).some((a) => a.role === name)
    );
    if (inUse.length > 0) {
      throw new ConvexError(
        `"${name}" is still assigned to ${inUse.length} ${inUse.length === 1 ? "person" : "people"} in ${args.year} — reassign them first.`
      );
    }
    await ctx.db.delete("roles", role._id);
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

    // Reverse sync: the head named on a department gets a Head of Department
    // assignment for it (creating the profile if needed). A same-department
    // Staff link is superseded; links to other departments/divisions/campuses
    // are preserved, so "Staff of A + Head of B" works. May hold HOD and HODiv.
    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DEPARTMENT, name);
    }

    // Drop the old head's Head-of-Department link for this department only.
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DEPARTMENT, name);
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
      {
        email: string;
        name: string | null;
        department: string | null;
        departments: string[];
      }
    >();
    const directory = await ctx.db.query("directoryUsers").take(4000);
    for (const user of directory) {
      byEmail.set(user.email, {
        email: user.email,
        name: user.name ?? null,
        department: null,
        departments: [],
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
        departments: existing?.departments ?? [],
      });
    }
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of profiles) {
      const existing = byEmail.get(profile.email);
      const departments = departmentsOf(profile);
      byEmail.set(profile.email, {
        email: profile.email,
        name: existing?.name ?? profile.name ?? null,
        department: departments[0] ?? null,
        departments,
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
        const current = assignmentsOf(profile);
        const referencesOld = current.some((a) => a.department === oldName);
        if (referencesOld) {
          const remapped = remapScope(current, "department", oldName, newName);
          await ctx.db.patch("staffProfiles", profile._id, { assignments: remapped });
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

    // Reverse sync: grant the Head of Department link to the new head; revoke it
    // from the old head (this department only). Other memberships are preserved.
    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DEPARTMENT, newName);
    }
    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DEPARTMENT, newName);
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

    // Open requests would become orphaned — refuse rather than silently corrupt.
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

    // Cascade: strip all assignments pointing to this department from staff profiles
    // in one pass (covers HOD and regular staff assignments).
    const yearProfiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    for (const profile of yearProfiles) {
      const current = assignmentsOf(profile);
      const filtered = current.filter((a) => a.department !== args.name);
      if (filtered.length !== current.length) {
        await patchFromAssignments(ctx, profile, filtered);
      }
    }

    // Clear the budget manager when the Finance department itself is deleted.
    if (args.name === FINANCE) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail) {
        await ctx.db.patch("yearSettings", settings._id, { budgetManagerEmail: undefined });
      }
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
    if (!profile || !isMemberOfDepartment(profile, FINANCE)) {
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
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    return profiles
      .filter((p) => isMemberOfDepartment(p, FINANCE))
      .map((p) => ({ email: p.email, name: p.name ?? null }));
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
      await ctx.db.insert("divisions", {
        year: args.to,
        name: division.name,
        headEmail: division.headEmail,
      });
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
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.from))
      .take(50);
    for (const role of roles) {
      const existing = await ctx.db
        .query("roles")
        .withIndex("by_year_and_name", (q) =>
          q.eq("year", args.to).eq("name", role.name)
        )
        .unique();
      if (!existing) {
        await ctx.db.insert("roles", { year: args.to, name: role.name });
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
        assignments: assignmentsOf(profile),
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
  // Chaplaincy is a real department so chaplain assignments validate and render
  // through the normal department machinery.
  Operations: ["Events", "Missions", CHAPLAINCY_DEPARTMENT],
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
        assignments: [{ role: STAFF_ROLE, department: "Data and IT" }],
      });
    }
    return { year, admin: email };
  },
});
