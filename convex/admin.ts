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
import {
  previousStaffYearByEmailKey,
  previousStaffYearForEmail,
  staffEmailCandidates,
} from "../shared/rollcallImport";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx, mutation, query, QueryCtx } from "./_generated/server";
import {
  currentStaffYear,
  DELEGATION_QUERY_LIMIT,
  findProfileForYear,
  incomingStaffYear,
  getDepartment,
  getProfile,
  getYearSettings,
  isAdminProfile,
  isOrgEmail,
  nextStaffYear,
  optionalEmail,
  requireAdmin,
  requireEmail,
  resolveStaffIdentity,
  rolesOf,
  setCachedDirectorEmail,
} from "./model";

const syncDirectorCacheAfterProfileChange = async (
  ctx: MutationCtx,
  year: number,
  email: string,
  nowDirector: boolean,
  previous: Doc<"staffProfiles"> | null
) => {
  const wasDirector = previous ? rolesOf(previous).includes(DIRECTOR) : false;
  if (nowDirector) {
    await setCachedDirectorEmail(ctx, year, email);
  } else if (wasDirector) {
    await setCachedDirectorEmail(ctx, year, "");
  }
};

const assertManagedYear = (year: number) => {
  if (year !== currentStaffYear() && year !== nextStaffYear()) {
    throw new ConvexError(
      `You can only manage ${currentStaffYear()} and ${nextStaffYear()}.`
    );
  }
};

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

const allowedRolesForYear = async (ctx: MutationCtx, year: number): Promise<Set<string>> => {
  const rows = await ctx.db.query("roles").withIndex("by_year_and_name", (q) => q.eq("year", year)).take(500);
  return rows.length > 0 ? new Set(rows.map((r) => r.name)) : new Set<string>(ROLES);
};

const isHeadRole = (role: string): boolean =>
  role === HEAD_OF_DEPARTMENT || role === HEAD_OF_DIVISION;

const patchFromAssignments = async (
  ctx: MutationCtx,
  profile: Doc<"staffProfiles">,
  assignments: Assignment[]
) => {
  await ctx.db.patch("staffProfiles", profile._id, {
    assignments: dedupeAssignments(assignments),
  });
};

const writeStaffProfile = async (
  ctx: MutationCtx,
  existing: Doc<"staffProfiles"> | null,
  email: string,
  year: number,
  assignments: Assignment[]
): Promise<Id<"staffProfiles">> => {
  const identity = await resolveStaffIdentity(ctx, email);
  const fields = {
    assignments,
    importId: existing?.importId ?? identity.importId,
    name: existing?.name ?? identity.name,
    userId: existing?.userId ?? identity.userId,
  };
  if (existing) {
    await ctx.db.patch("staffProfiles", existing._id, fields);
    return existing._id;
  }
  return await ctx.db.insert("staffProfiles", { email, year, ...fields });
};

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
  const profile = await findProfileForYear(ctx, email, year);
  if (!profile) {
    await writeStaffProfile(ctx, null, email, year, [headAssignment]);
    return;
  }
  const kept = assignmentsOf(profile).filter((a) => {
    if (a.role === role) {
      const existingScope =
        role === HEAD_OF_DEPARTMENT ? a.department : a.division;
      return existingScope !== scopeName;
    }
    if (role === HEAD_OF_DEPARTMENT && !isHeadRole(a.role) && a.department === scopeName) {
      return false;
    }
    return true;
  });
  await patchFromAssignments(ctx, profile, [...kept, headAssignment]);
};

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

const remapScope = (
  assignments: Assignment[],
  key: "department" | "division" | "university",
  oldName: string,
  newName: string
): Assignment[] =>
  assignments.map((a) => (a[key] === oldName ? { ...a, [key]: newName } : a));

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
      const drafts = args.assignments;
      if (drafts.length === 0) throw new ConvexError("Add at least one assignment.");

      const existing = await findProfileForYear(ctx, email, args.year);
      const existingHeadRoles = existing ? rolesOf(existing).filter(isHeadRole) : [];

      const allowed = await allowedRolesForYear(ctx, args.year);
      for (const a of drafts) {
        if (!allowed.has(a.role)) {
          throw new ConvexError(`Roles must be among the roles available for ${args.year}.`);
        }
        if (isHeadRole(a.role) && !existingHeadRoles.includes(a.role)) {
          throw new ConvexError(
            "Head of Department and Head of Division are assigned through the Structure section. Edit the department or division directly to change its head."
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
            `${existingDirector.email} is already the Director for ${args.year}. There can only be one.`
          );
        }
      }

      const builtAssignments: Assignment[] = [];
      for (const draft of drafts) {
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
              `The "${CHAPLAINCY_DEPARTMENT}" department doesn't exist in ${args.year}. Create it first.`
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

      await setLeaver(ctx, args.year, email, false);
      const profileId = await writeStaffProfile(
        ctx,
        existing,
        email,
        args.year,
        assignments
      );
      await syncDirectorCacheAfterProfileChange(
        ctx,
        args.year,
        email,
        assignments.some((a) => a.role === DIRECTOR),
        existing
      );
      return profileId;
    }

    const roles = [...new Set(args.roles ?? [])];
    if (roles.length === 0) throw new ConvexError("Pick at least one role.");
    const allowed = await allowedRolesForYear(ctx, args.year);
    for (const role of roles) {
      if (!allowed.has(role)) {
        throw new ConvexError(`Roles must be among the roles available for ${args.year}.`);
      }
    }

    const existing = await findProfileForYear(ctx, email, args.year);
    const existingHeadRoles = existing
      ? rolesOf(existing).filter(isHeadRole)
      : [];

    if (roles.some((r) => isHeadRole(r) && !existingHeadRoles.includes(r))) {
      throw new ConvexError(
        "Head of Department and Head of Division are assigned through the Structure section. Edit the department or division directly to change its head."
      );
    }

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
          `${existingDirector.email} is already the Director for ${args.year}. There can only be one.`
        );
      }
    }

    const nonHeadRoles = roles.filter((r) => !isHeadRole(r));
    const needsUniversity = rolesNeedUniversity(nonHeadRoles);
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
          `The "${CHAPLAINCY_DEPARTMENT}" department doesn't exist in ${args.year}. Create it first.`
        );
      }
    }

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

    const submitted = nonHeadRoles.map((role) =>
      assignmentFor(role, { department, university })
    );
    const preservedHead = existing
      ? assignmentsOf(existing).filter((a) => isHeadRole(a.role))
      : [];
    const headedDepts = new Set(
      preservedHead
        .filter((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
        .map((a) => a.department)
    );
    const submittedKept = submitted.filter(
      (a) => !(a.department && headedDepts.has(a.department))
    );
    const assignments = dedupeAssignments([...submittedKept, ...preservedHead]);

    if (!assignments.some((a) => a.department === FINANCE)) {
      const settings = await getYearSettings(ctx, args.year);
      if (settings?.budgetManagerEmail === email) {
        await ctx.db.patch("yearSettings", settings._id, {
          budgetManagerEmail: undefined,
        });
      }
    }

    await setLeaver(ctx, args.year, email, false);
    const profileId = await writeStaffProfile(
      ctx,
      existing,
      email,
      args.year,
      assignments
    );
    await syncDirectorCacheAfterProfileChange(
      ctx,
      args.year,
      email,
      assignments.some((a) => a.role === DIRECTOR),
      existing
    );
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
    const wasDirector = profile ? rolesOf(profile).includes(DIRECTOR) : false;
    if (profile) await ctx.db.delete("staffProfiles", profile._id);
    const settings = await getYearSettings(ctx, args.year);
    if (settings?.budgetManagerEmail === email) {
      await ctx.db.patch("yearSettings", settings._id, {
        budgetManagerEmail: undefined,
      });
    }
    if (wasDirector) {
      await setCachedDirectorEmail(ctx, args.year, "");
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
    await setLeaver(ctx, args.year, email, true);
    return null;
  },
});

export const listStaffProfiles = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
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

export const listUnassignedUsers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(1000);
    const directoryUsers = await ctx.db.query("directoryUsers").take(4000);
    const directoryNameByEmail = new Map(
      directoryUsers.map((u) => [u.email, u.name ?? null] as const)
    );
    const leaverEmails = await leaverEmailSet(ctx, args.year);
    const allProfiles = await ctx.db.query("staffProfiles").take(4000);
    const currentKeys = new Set<string>();
    for (const profile of allProfiles) {
      if (profile.year !== args.year) continue;
      for (const key of staffEmailCandidates(profile.email)) currentKeys.add(key);
    }
    const previousByEmail = previousStaffYearByEmailKey(allProfiles, args.year);
    const unassigned: {
      email: string;
      name: string | null;
      previousYear: number | null;
    }[] = [];
    for (const user of users) {
      if (!user.email || leaverEmails.has(user.email)) continue;
      if (!isOrgEmail(user.email)) continue;
      const keys = staffEmailCandidates(user.email);
      if (keys.some((key) => currentKeys.has(key))) continue;
      unassigned.push({
        email: user.email,
        name: user.name ?? directoryNameByEmail.get(user.email) ?? null,
        previousYear: previousStaffYearForEmail(previousByEmail, user.email) ?? null,
      });
    }
    return unassigned;
  },
});

export const listLeavers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
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

export const markLeaving = mutation({
  args: { email: v.string(), year: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertManagedYear(args.year);
    await setLeaver(ctx, args.year, args.email.trim().toLowerCase(), true);
    return null;
  },
});

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

    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DIVISION, name);
    }

    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DIVISION, name);
    }

    return divisionId;
  },
});

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

      const departments = await ctx.db
        .query("departments")
        .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
        .take(200);
      for (const dept of departments) {
        if (dept.division === oldName) {
          await ctx.db.patch("departments", dept._id, { division: newName });
        }
      }
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

    const departments = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year))
      .take(200);
    const divDepts = departments.filter((d) => d.division === args.name);
    const deptNames = new Set(divDepts.map((d) => d.name));

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
          `"${dept.name}" still has open requests in ${args.year}. Complete or cancel them first.`
        );
      }
    }

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

export const ensureUniversity = internalMutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new ConvexError("University name is required.");
    const existing = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .first();
    if (existing) {
      return { id: existing._id, created: false as const, year: args.year, name };
    }
    const id = await ctx.db.insert("universities", { year: args.year, name });
    return { id, created: true as const, year: args.year, name };
  },
});

export const removeUniversityRow = internalMutation({
  args: { year: v.number(), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new ConvexError("University name is required.");
    const university = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", args.year).eq("name", name))
      .first();
    if (!university) {
      return { removed: false as const, year: args.year, name, profilesTouched: 0 };
    }
    let profilesTouched = 0;
    for await (const profile of ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))) {
      const current = assignmentsOf(profile);
      const filtered = current.filter((a) => a.university !== name);
      if (filtered.length !== current.length) {
        await patchFromAssignments(ctx, profile, filtered);
        profilesTouched++;
      }
    }
    await ctx.db.delete("universities", university._id);
    return { removed: true as const, year: args.year, name, profilesTouched };
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
        `"${name}" is still assigned to ${inUse.length} ${inUse.length === 1 ? "person" : "people"} in ${args.year}. Reassign them first.`
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

    if (headEmail) {
      await grantHead(ctx, args.year, headEmail, HEAD_OF_DEPARTMENT, name);
    }

    if (oldHeadEmail && oldHeadEmail !== headEmail) {
      await revokeHead(ctx, args.year, oldHeadEmail, HEAD_OF_DEPARTMENT, name);
    }

    return departmentId;
  },
});

export const people = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
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

      await ctx.db.patch("departments", existing._id, {
        name: newName,
        division: args.division,
        headEmail,
      });

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
        `"${args.name}" still has open requests in ${args.year}. Complete or cancel them first.`
      );
    }

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

const requireFinanceSettingsAccess = async (
  ctx: QueryCtx,
  year: number,
  action: string
): Promise<string> => {
  const callerEmail = await requireEmail(ctx);
  const adminProfile = await getProfile(ctx, callerEmail, currentStaffYear());
  if (adminProfile && (await isAdminProfile(ctx, adminProfile))) return callerEmail;
  const financeDept = await getDepartment(ctx, year, FINANCE);
  if (financeDept?.headEmail === callerEmail) return callerEmail;
  throw new ConvexError(`Only admins or the Finance Head can ${action}.`);
};

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

export const fillTagScopesWithAllGroups = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tags = await ctx.db.query("attendanceTags").collect();
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

export const nameStaffProfilesFromEmail = internalMutation({
  args: {},
  handler: async (ctx) => {
    const profiles = await ctx.db.query("staffProfiles").collect();
    let updated = 0;
    for (const p of profiles) {
      const name = p.name?.trim();
      if (name && name.toLowerCase() !== p.email.toLowerCase()) continue;
      const derived = displayNameFromEmail(p.email);
      if (!derived) continue;
      await ctx.db.patch(p._id, { name: derived });
      updated++;
    }
    return { updated, total: profiles.length };
  },
});

export const financeMembers = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    const callerEmail = await optionalEmail(ctx);
    if (!callerEmail) return null;
    const adminProfile = await getProfile(ctx, callerEmail, currentStaffYear());
    const isAdmin =
      !!adminProfile && (await isAdminProfile(ctx, adminProfile));
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

export const listDelegations = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
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

export const removeDelegation = mutation({
  args: { id: v.id("approverDelegations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("approverDelegations", args.id);
    await requireFinanceSettingsAccess(
      ctx,
      row?.year ?? currentStaffYear(),
      "remove delegations"
    );
    if (row) await ctx.db.delete("approverDelegations", args.id);
    return null;
  },
});

const copyYearData = async (ctx: MutationCtx, from: number, to: number) => {
  if (from === to) throw new ConvexError("from and to must differ.");
  const counts = {
    divisions: 0,
    departments: 0,
    universities: 0,
    roles: 0,
    profiles: 0,
    budgetManagers: 0,
    directorThresholds: 0,
  };

  for await (const division of ctx.db
    .query("divisions")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))) {
    const existing = await ctx.db
      .query("divisions")
      .withIndex("by_year_and_name", (q) => q.eq("year", to).eq("name", division.name))
      .first();
    const fields = { headEmail: division.headEmail };
    if (existing) {
      await ctx.db.patch("divisions", existing._id, fields);
    } else {
      await ctx.db.insert("divisions", { year: to, name: division.name, ...fields });
    }
    counts.divisions++;
  }
  for await (const department of ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))) {
    const existing = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", to).eq("name", department.name)
      )
      .first();
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
  for await (const university of ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))) {
    const existing = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) =>
        q.eq("year", to).eq("name", university.name)
      )
      .first();
    if (!existing) {
      await ctx.db.insert("universities", { year: to, name: university.name });
    }
    counts.universities++;
  }
  for await (const role of ctx.db
    .query("roles")
    .withIndex("by_year_and_name", (q) => q.eq("year", from))) {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_year_and_name", (q) => q.eq("year", to).eq("name", role.name))
      .first();
    if (!existing) {
      await ctx.db.insert("roles", { year: to, name: role.name });
    }
    counts.roles++;
  }
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", from))) {
    const fields = {
      assignments: assignmentsOf(profile),
      name: profile.name,
      userId: profile.userId,
      importId: profile.importId,
    };
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
        .first());
    if (existing) {
      await ctx.db.patch("staffProfiles", existing._id, fields);
    } else {
      await ctx.db.insert("staffProfiles", { email: profile.email, year: to, ...fields });
    }
    counts.profiles++;
  }

  const fromSettings = await getYearSettings(ctx, from);
  if (fromSettings?.budgetManagerEmail || fromSettings?.directorApprovalThreshold !== undefined) {
    const toSettings = await getYearSettings(ctx, to);
    const patch: {
      budgetManagerEmail?: string;
      directorApprovalThreshold?: number;
    } = {};
    if (fromSettings.budgetManagerEmail) {
      patch.budgetManagerEmail = fromSettings.budgetManagerEmail;
      counts.budgetManagers++;
    }
    if (fromSettings.directorApprovalThreshold !== undefined) {
      patch.directorApprovalThreshold = fromSettings.directorApprovalThreshold;
      counts.directorThresholds++;
    }
    if (toSettings) {
      await ctx.db.patch("yearSettings", toSettings._id, patch);
    } else {
      await ctx.db.insert("yearSettings", { year: to, ...patch });
    }
  }

  let directorEmail = "";
  for await (const profile of ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", to))) {
    if (rolesOf(profile).includes(DIRECTOR)) {
      directorEmail = profile.email;
      break;
    }
  }
  const toSettings = await getYearSettings(ctx, to);
  const completion = {
    rolloverCopiedFrom: from,
    rolloverCompletedAt: Date.now(),
    directorEmail,
  };
  if (toSettings) {
    await ctx.db.patch("yearSettings", toSettings._id, completion);
  } else {
    await ctx.db.insert("yearSettings", { year: to, ...completion });
  }

  return counts;
};

type CopyYearCounts = Awaited<ReturnType<typeof copyYearData>>;

const alreadyCopiedFrom = async (
  ctx: MutationCtx,
  from: number,
  to: number
): Promise<boolean> => {
  const settings = await getYearSettings(ctx, to);
  return (
    settings?.rolloverCopiedFrom === from &&
    settings.rolloverCompletedAt !== undefined
  );
};

export const copyYear = internalMutation({
  args: {
    from: v.number(),
    to: v.number(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.force && (await alreadyCopiedFrom(ctx, args.from, args.to))) {
      throw new ConvexError(
        `${args.to} was already copied from ${args.from}. Pass force:true to overwrite.`
      );
    }
    return await copyYearData(ctx, args.from, args.to);
  },
});

const PREFILL_NOTIFY_EMAILS = ["info@sow.org.au", "it@sow.org.au"] as const;

const prefillNextStaffYearHandler = async (ctx: MutationCtx) => {
  const from = incomingStaffYear();
  const to = from + 1;
  const recomputeInsights = async () => {
    await ctx.scheduler.runAfter(0, internal.attendanceMetrics.recomputeAll, {
      staffYear: from,
    });
  };
  if (await alreadyCopiedFrom(ctx, from, to)) {
    console.log(
      `prefillNextStaffYear: skipping — ${to} already copied from ${from}`
    );
    await recomputeInsights();
    return {
      skipped: true as const,
      from,
      to,
      divisions: 0,
      departments: 0,
      universities: 0,
      roles: 0,
      profiles: 0,
      budgetManagers: 0,
      directorThresholds: 0,
    };
  }
  const counts: CopyYearCounts = await copyYearData(ctx, from, to);
  const subject = `THE SHED: staff year prefill, ${from} copied to ${to}`;
  const siteUrl = process.env.SITE_URL ?? process.env.APP_URL ?? "unknown";
  const body = [
    `The annual staff-year prefill ran and copied ${from} into ${to}.`,
    "",
    "Copied:",
    `  Divisions:    ${counts.divisions}`,
    `  Departments:  ${counts.departments}`,
    `  Universities: ${counts.universities}`,
    `  Roles:        ${counts.roles}`,
    `  Staff profiles: ${counts.profiles}`,
    `  Budget manager: ${counts.budgetManagers === 1 ? "yes" : "none"}`,
    `  Director threshold: ${counts.directorThresholds === 1 ? "yes" : "none"}`,
    "",
    `${to} is now ready to configure in THE SHED as next staff year after ${from}.`,
    "",
    `Deployment: ${siteUrl}`,
  ].join("\n");
  for (const address of PREFILL_NOTIFY_EMAILS) {
    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: address,
      subject,
      body,
    });
  }
  await recomputeInsights();
  return { skipped: false as const, from, to, ...counts };
};

export const prefillNextStaffYear = internalMutation({
  args: {},
  handler: prefillNextStaffYearHandler,
});

export const rollOverStaffYear = internalMutation({
  args: {},
  handler: prefillNextStaffYearHandler,
});

const ORG_STRUCTURE: Record<string, string[]> = {
  Governance: ["Data and IT", FINANCE, "Compliance"],
  Engagement: ["Marketing", "Alumni"],
  "Human Resources": ["People and Culture", "Training and Development"],
  Operations: ["Events", "Missions", CHAPLAINCY_DEPARTMENT],
};

const UNIVERSITIES = [
  "Macquarie University",
  "University of New South Wales",
  "University of Sydney",
  "University of Technology, Sydney",
  "Western Sydney University",
];

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
