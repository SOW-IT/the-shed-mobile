import { ConvexError, v } from "convex/values";
import {
  Assignment,
  assignmentFor,
  assignmentsOf,
  CHAPLAINCY_DEPARTMENT,
  dedupeAssignments,
  departmentsOf,
  DIRECTOR,
  DIRECTOR_APPROVAL_THRESHOLD,
  EARLIEST_REQUEST_YEAR,
  FINANCE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isChaplainRole,
  isMemberOfDepartment,
  isSystemRole,
  MEMBER,
  requestCompleted,
  ROLES,
  roleNeedsDepartment,
  roleNeedsUniversity,
  rolesNeedUniversity,
  staffYearStartMs,
  STAFF_ROLE,
  STAFF_SIDE_ROLES,
} from "../shared/flow";
import { displayNameFromEmail, normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx, mutation, query, QueryCtx } from "./_generated/server";
import {
  currentStaffYear,
  DELEGATION_QUERY_LIMIT,
  getDepartment,
  getProfile,
  getYearSettings,
  isAdminProfile,
  isOrgEmail,
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
 * Add or remove a person from the year's "not serving" list (idempotent). One
 * row per (year, email): set when a profile is deleted or marked leaving,
 * cleared when they're moved back to the unassigned pool or reassigned.
 */
const setLeaver = async (
  ctx: MutationCtx,
  year: number,
  email: string,
  leaving: boolean
) => {
  const existing = await ctx.db
    .query("leavers")
    .withIndex("by_year_and_email", (q) => q.eq("year", year).eq("email", email))
    .unique();
  if (leaving && !existing) {
    await ctx.db.insert("leavers", { year, email });
  } else if (!leaving && existing) {
    await ctx.db.delete("leavers", existing._id);
  }
};

/** The set of emails parked in the year's "not serving" list. */
const leaverEmailSet = async (
  ctx: QueryCtx,
  year: number
): Promise<Set<string>> => {
  const rows = await ctx.db
    .query("leavers")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(1000);
  return new Set(rows.map((r) => r.email));
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

      // Assigning a profile means they're serving again — clear any leaver row.
      await setLeaver(ctx, args.year, email, false);
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

    // Assigning a profile means they're serving again — clear any leaver row.
    await setLeaver(ctx, args.year, email, false);
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
    // A deleted profile moves the person to the year's "not serving" list.
    await setLeaver(ctx, args.year, email, true);
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
    // People parked in the "not serving" list belong there, not in unassigned.
    const leaverEmails = await leaverEmailSet(ctx, args.year);
    const unassigned: { email: string; name: string | null }[] = [];
    for (const user of users) {
      if (!user.email || leaverEmails.has(user.email)) continue;
      // Non-staff (personal) accounts can sign in (1.7.4) but are never
      // assignable staff — keep them out of the Users assignment list.
      if (!isOrgEmail(user.email)) continue;
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

/**
 * People marked "not serving" for the year, with names resolved. Excludes
 * anyone who now holds a profile (defensive — a reassign clears the leaver row).
 * Admins only.
 */
export const listLeavers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("leavers")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(1000);
    const directoryUsers = await ctx.db.query("directoryUsers").take(4000);
    const directoryNameByEmail = new Map(
      directoryUsers.map((u) => [u.email, u.name ?? null] as const)
    );
    const leavers: { email: string; name: string | null }[] = [];
    for (const row of rows) {
      if (await getProfile(ctx, row.email, args.year)) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", row.email))
        .first();
      leavers.push({
        email: row.email,
        name: user?.name ?? directoryNameByEmail.get(row.email) ?? null,
      });
    }
    return leavers;
  },
});

/** Park an unassigned person in the year's "not serving" list. Admins only. */
export const markLeaving = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    await setLeaver(ctx, args.year, args.email.trim().toLowerCase(), true);
    return null;
  },
});

/** Move a person out of "not serving" and back into the unassigned pool. */
export const unmarkLeaving = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    await setLeaver(ctx, args.year, args.email.trim().toLowerCase(), false);
    return null;
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
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", staffYearStartMs(args.year))
           .lt("_creationTime", staffYearStartMs(args.year + 1))
        )
        .filter((q) => q.eq(q.field("department"), dept.name))
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
    if (isSystemRole(oldName) || isSystemRole(newName)) {
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
    if (isSystemRole(name)) {
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
    // Admins and the Finance Head: the Finance Head needs this list for the
    // Approver Delegation picker. It's the year's people directory — no more
    // than the now-public org chart already exposes.
    await requireFinanceSettingsAccess(ctx, args.year, "view people");
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
      // Skip non-staff (personal) accounts — the people picker feeds staff
      // assignment surfaces (heads, delegates), which are org-only (1.7.4).
      if (!user.email || !isOrgEmail(user.email)) continue;
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
        .withIndex("by_creation_time", (q) =>
          q.gte("_creationTime", staffYearStartMs(args.year))
           .lt("_creationTime", staffYearStartMs(args.year + 1))
        )
        .filter((q) => q.eq(q.field("department"), oldName))
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
      .withIndex("by_creation_time", (q) =>
        q.gte("_creationTime", staffYearStartMs(args.year))
         .lt("_creationTime", staffYearStartMs(args.year + 1))
      )
      .filter((q) => q.eq(q.field("department"), args.name))
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

/**
 * Year-level finance settings (Budget Manager, Director threshold) are editable
 * by admins OR the Finance Head (Head of the Finance department). Throws
 * otherwise; returns the caller's email. `action` completes the error sentence.
 */
const requireFinanceSettingsAccess = async (
  // Read-only, so it accepts a query ctx too (mutations satisfy QueryCtx) —
  // lets the finance-gated queries (people, listDelegations) reuse it.
  ctx: QueryCtx,
  year: number,
  action: string
): Promise<string> => {
  const callerEmail = await requireEmail(ctx);
  // Admin status is judged on the caller's CURRENT staff-year profile — the same
  // basis as requireAdmin (which gates the sibling admin queries listUnassigned/
  // listLeavers). Admins manage the current AND next staff year, but an admin's
  // authority usually comes from a division headship or Data-and-IT membership
  // that their *next-year* profile doesn't carry — so gating on the viewed year
  // meant switching the year picker to next year threw "Only admins…" and blanked
  // the whole admin screen. Basing it on the current year keeps `people` in step
  // with its sibling queries.
  const adminProfile = await getProfile(ctx, callerEmail, currentStaffYear());
  if (adminProfile && (await isAdminProfile(ctx, adminProfile))) return callerEmail;
  // Otherwise the Finance Head of the viewed year may view people — they need it
  // for that year's approver-delegation picker.
  const financeDept = await getDepartment(ctx, year, FINANCE);
  if (financeDept?.headEmail === callerEmail) return callerEmail;
  throw new ConvexError(`Only admins or the Finance Head can ${action}.`);
};

/** The Budget Manager must be a member of the Finance department that year. */
export const setBudgetManager = mutation({
  args: { year: v.number(), email: v.string() },
  handler: async (ctx, args) => {
    assertManagedYear(args.year);
    await requireFinanceSettingsAccess(ctx, args.year, "set the Budget Manager");
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
 * The $ amount at or above which a request also needs Director approval, set
 * per staff year by Finance (admins OR the Finance Head). Unset years fall back
 * to DIRECTOR_APPROVAL_THRESHOLD. Only affects requests submitted from now on —
 * existing requests keep the Director step they were created with.
 */
export const setDirectorThreshold = mutation({
  args: { year: v.number(), amount: v.number() },
  handler: async (ctx, args) => {
    assertManagedYear(args.year);
    await requireFinanceSettingsAccess(
      ctx,
      args.year,
      "change the Director approval threshold"
    );
    if (!(args.amount > 0)) {
      throw new ConvexError("The threshold must be a positive amount.");
    }
    const settings = await getYearSettings(ctx, args.year);
    if (settings) {
      await ctx.db.patch("yearSettings", settings._id, {
        directorApprovalThreshold: args.amount,
      });
      return settings._id;
    }
    return await ctx.db.insert("yearSettings", {
      year: args.year,
      directorApprovalThreshold: args.amount,
    });
  },
});

/**
 * One-off backfill: stamp the historical default ($5,000) onto every staff
 * year from EARLIEST_REQUEST_YEAR through next year that hasn't already set a
 * Director threshold, so past years show an explicit value rather than relying
 * on the code fallback. Idempotent. Run with:
 *   npx convex run admin:backfillDirectorThresholds
 */
export const backfillDirectorThresholds = internalMutation({
  args: {},
  handler: async (ctx) => {
    let filled = 0;
    for (let year = EARLIEST_REQUEST_YEAR; year <= nextStaffYear(); year++) {
      const settings = await getYearSettings(ctx, year);
      if (settings) {
        if (settings.directorApprovalThreshold === undefined) {
          await ctx.db.patch("yearSettings", settings._id, {
            directorApprovalThreshold: DIRECTOR_APPROVAL_THRESHOLD,
          });
          filled++;
        }
      } else {
        await ctx.db.insert("yearSettings", {
          year,
          directorApprovalThreshold: DIRECTOR_APPROVAL_THRESHOLD,
        });
        filled++;
      }
    }
    return { filled };
  },
});

/**
 * An empty/undefined tag `subgroups` scope has always meant "applies to all
 * groups" implicitly. The Tags picker no longer offers an explicit "All"
 * option, so make that scope explicit. Tags are global (year-less), so fill
 * every such tag with the current staff year's groups (SOW + that year's
 * universities). Idempotent — tags that already have a scope are left untouched.
 */
export const fillTagScopesWithAllGroups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query("attendanceTags").collect();
    // A single staff year has a handful of universities; bound the read per the
    // repo's Convex guidelines rather than collecting unboundedly.
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", currentStaffYear()))
      .take(1000);
    const allGroups = normalizeSubgroups([
      SOW_SUBGROUP,
      ...universities.map((u) => u.name),
    ]);
    let filled = 0;
    if (allGroups.length > 0) {
      for (const tag of tags) {
        if (tag.subgroups?.length) continue;
        await ctx.db.patch(tag._id, { subgroups: allGroups });
        filled++;
      }
    }
    return { filled, total: tags.length };
  },
});

/**
 * One-off backfill: many imported staff profiles have no `name` (or carry their
 * email as the name), so the app falls back to showing the bare address. Derive
 * a readable "First Last" from the email's local part for those profiles.
 * Profiles that already have a real name, or whose email isn't name-shaped
 * (e.g. synthetic `@legacy.invalid` or numeric handles), are left untouched.
 * Idempotent.
 */
export const nameStaffProfilesFromEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("staffProfiles").collect();
    let updated = 0;
    for (const p of profiles) {
      const name = p.name?.trim();
      // Only touch profiles whose visible name is just the email (or missing).
      if (name && name.toLowerCase() !== p.email.toLowerCase()) continue;
      const derived = displayNameFromEmail(p.email);
      if (!derived) continue;
      await ctx.db.patch(p._id, { name: derived });
      updated++;
    }
    return { updated, total: profiles.length };
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

// ---------------------------------------------------------------------------
// Approver delegation (out-of-office cover): a delegate may act on every
// request the delegator could approve/decline/pay. Admin-managed; the read
// side lives in model.ts (delegatorsForYear / actAsEmails) so requests.ts can
// widen its approver checks.
// ---------------------------------------------------------------------------

/** All approver delegations for a year, with names resolved. Admins only. */
export const listDelegations = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireFinanceSettingsAccess(ctx, args.year, "view delegations");
    const rows = await ctx.db
      .query("approverDelegations")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(DELEGATION_QUERY_LIMIT);
    return rows.map((r) => ({
      id: r._id,
      fromEmail: r.fromEmail,
      toEmail: r.toEmail,
    }));
  },
});

/**
 * Delegate every approval the `from` person could do to the `to` person for the
 * year. Both must have a profile that year, and differ. Idempotent per pair.
 */
export const addDelegation = mutation({
  args: { year: v.number(), fromEmail: v.string(), toEmail: v.string() },
  handler: async (ctx, args) => {
    await requireFinanceSettingsAccess(ctx, args.year, "set delegations");
    assertManagedYear(args.year);
    const fromEmail = args.fromEmail.trim().toLowerCase();
    const toEmail = args.toEmail.trim().toLowerCase();
    if (!fromEmail.includes("@") || !toEmail.includes("@")) {
      throw new ConvexError("Pick valid people.");
    }
    if (fromEmail === toEmail) {
      throw new ConvexError("Pick two different people.");
    }
    if (!(await getProfile(ctx, fromEmail, args.year))) {
      throw new ConvexError(`${fromEmail} has no profile for ${args.year}.`);
    }
    if (!(await getProfile(ctx, toEmail, args.year))) {
      throw new ConvexError(`${toEmail} has no profile for ${args.year}.`);
    }
    const existing = await ctx.db
      .query("approverDelegations")
      .withIndex("by_year_and_from_and_to", (q) =>
        q.eq("year", args.year).eq("fromEmail", fromEmail).eq("toEmail", toEmail)
      )
      .unique();
    if (existing) return existing._id;
    return await ctx.db.insert("approverDelegations", {
      year: args.year,
      fromEmail,
      toEmail,
    });
  },
});

/** Remove a delegation by id (admins or the Finance Head). Any year, for cleanup. */
export const removeDelegation = mutation({
  args: { id: v.id("approverDelegations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("approverDelegations", args.id);
    // Authorise against the delegation's own year; fall back to the live staff
    // year when the row is already gone so a stale id can't skip the check.
    await requireFinanceSettingsAccess(
      ctx,
      row?.year ?? currentStaffYear(),
      "remove delegations"
    );
    if (row) await ctx.db.delete("approverDelegations", args.id);
    return null;
  },
});

/**
 * Copies the `from` year's divisions, departments, universities, roles, staff
 * profiles and budget manager into the `to` year, leaving both years' existing
 * data intact. Non-destructive merge keyed by natural keys (name, or person
 * email/importId for profiles): the source overwrites on conflict, anything the
 * destination already had that the source lacks is kept, and nothing is
 * duplicated. Shared by copyYear (manual) and rollOverStaffYear (the cron).
 *
 * Because it never deletes, stale destination roles/universities survive by
 * design (an admin's in-progress next-year setup must not be wiped). This is
 * safe given the rollover target year is normally empty when first seeded; a
 * leftover role would otherwise flip allowedRolesForYear to data-driven
 * validation, so clear that year's roles by hand if you ever need to reset it.
 */
const copyYearData = async (ctx: MutationCtx, from: number, to: number) => {
  if (from === to) throw new ConvexError("from and to must differ.");
  const counts = { divisions: 0, departments: 0, profiles: 0, budgetManagers: 0 };

  const divisions = await ctx.db
    .query("divisions")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))
    .take(200);
  for (const division of divisions) {
    const existing = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", to).eq("name", division.name))
      .unique();
    const fields = { headEmail: division.headEmail };
    if (existing) {
      await ctx.db.patch("divisions", existing._id, fields);
    } else {
      await ctx.db.insert("divisions", { year: to, name: division.name, ...fields });
    }
    counts.divisions++;
  }
  const departments = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))
    .take(200);
  for (const department of departments) {
    const existing = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", to).eq("name", department.name)
      )
      .unique();
    const fields = {
      division: department.division,
      headEmail: department.headEmail,
      colour: department.colour,
    };
    if (existing) {
      await ctx.db.patch("departments", existing._id, fields);
    } else {
      await ctx.db.insert("departments", { year: to, name: department.name, ...fields });
    }
    counts.departments++;
  }
  const universities = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))
    .take(50);
  for (const university of universities) {
    const existing = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", to).eq("name", university.name)
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("universities", { year: to, name: university.name });
    }
  }
  const roles = await ctx.db
    .query("roles")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))
    .take(50);
  for (const role of roles) {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", to).eq("name", role.name))
      .unique();
    if (!existing) {
      await ctx.db.insert("roles", { year: to, name: role.name });
    }
  }
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", from))
    .take(2000);
  for (const profile of profiles) {
    const fields = {
      assignments: assignmentsOf(profile),
      name: profile.name,
      userId: profile.userId,
      importId: profile.importId,
    };
    // Match the same person in the destination year by their durable importId
    // first (their email may differ year to year), then by email — so a re-copy
    // updates the existing row rather than inserting a duplicate person-year.
    const byPerson = profile.importId
      ? await ctx.db
          .query("staffProfiles")
          .withIndex("by_importId", (q) => q.eq("importId", profile.importId))
          .take(100)
      : [];
    const existing =
      byPerson.find((p) => p.year === to) ??
      (await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", profile.email).eq("year", to)
        )
        .unique());
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, fields);
    } else {
      await ctx.db.insert("staffProfiles", { email: profile.email, year: to, ...fields });
    }
    counts.profiles++;
  }

  // Mirror the source's budget manager onto the destination when it has one;
  // a destination budget manager is left untouched when the source has none.
  const fromSettings = await getYearSettings(ctx, from);
  if (fromSettings?.budgetManagerEmail) {
    const toSettings = await getYearSettings(ctx, to);
    if (toSettings) {
      await ctx.db.patch("yearSettings", toSettings._id, {
        budgetManagerEmail: fromSettings.budgetManagerEmail,
      });
    } else {
      await ctx.db.insert("yearSettings", {
        year: to,
        budgetManagerEmail: fromSettings.budgetManagerEmail,
      });
    }
    counts.budgetManagers++;
  }

  return counts;
};

/**
 * Copies one year's divisions, departments, universities, roles, staff
 * profiles and budget manager into another year (non-destructive merge; see
 * copyYearData) — e.g. provisioning next year from the current one at rollover.
 * Run with: npx convex run admin:copyYear '{"from":2026,"to":2027}'
 */
export const copyYear = internalMutation({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => copyYearData(ctx, args.from, args.to),
});

/** Where the staff-year rollover summary email goes. */
const ROLLOVER_NOTIFY_EMAIL = "it@sow.org.au";

/**
 * Oct 1 rollover (cron): on that day the staff year advances, so
 * currentStaffYear() is already next calendar year and nextStaffYear() the one
 * after. Prefills the new next staff year (2 calendar years out) from the new
 * current staff year so admins can start configuring it from a populated copy,
 * then emails IT a summary of what was copied.
 * e.g. firing on 2026-10-01 copies 2027 -> 2028.
 */
export const rollOverStaffYear = internalMutation({
  args: {},
  handler: async (ctx) => {
    const from = currentStaffYear();
    const to = nextStaffYear();
    const counts = await copyYearData(ctx, from, to);
    const subject = `THE SHED: staff year rollover — ${from} copied to ${to}`;
    const body = [
      `The annual staff-year rollover ran and prefilled ${to} from ${from}.`,
      "",
      "Copied:",
      `  Divisions:    ${counts.divisions}`,
      `  Departments:  ${counts.departments}`,
      `  Staff profiles: ${counts.profiles}`,
      `  Budget manager: ${counts.budgetManagers === 1 ? "yes" : "none"}`,
      "",
      `${to} is now the next staff year and ready to configure in THE SHED.`,
    ].join("\n");
    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: ROLLOVER_NOTIFY_EMAIL,
      subject,
      body,
    });
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
