import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { campusesLed, rolesOfLike, staffYearForDate, sydneyCalendarYear } from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
  memberOwnMetadata,
  type MetadataFieldLike as MetadataField,
  metadataSubtitle,
  resolveUniversity,
  ROLE_FIELD_KEY,
  roleFilterMatches,
  sameMetadata,
  staffLockedMetadata,
  STUDENT_YEAR_FIELD_KEY,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "../shared/attendanceMemberMeta";
import { markedRoleOf, memberRole, withMarkedRole } from "../shared/memberRole";
import { capitalizeMemberName, personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey, isSowStaffAddress, staffEmailCandidates } from "../shared/rollcallImport";
import {
  buildMergedFields,
  detectMergeConflicts,
  fieldsTakenFromRemoved,
  type MergeConflict,
  type MergeSide,
} from "../shared/memberMerge";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Ctx, currentStaffYear, getProfile, optionalProfile, requireAdmin, requireProfile } from "./model";
import {
  auditStamp,
  logAttendanceAction,
  MAX_AUDIT_ATTENDANCE_LINES,
} from "./attendanceAudit";
import { recountEventAttendance } from "./attendanceCounts";
import { Doc, Id } from "./_generated/dataModel";
import { deleteMember, insertMember, memberCount } from "./memberCount";
import { memberRoleResolver, memberRolesFor } from "./memberRoles";
import { photoFor } from "./photo";
import { readSettings } from "./weeklyInsights";
import {
  assignedProfileForEmail,
  isAssigned,
  knownMemberId,
  linkOrCreateMember,
  linkPerson,
  moveAttendance,
  personName,
  profileOwnName,
  profilesOfMember,
  staffMemberName,
  staffProfileOfMember,
  staffRowName,
} from "./staffMembers";

export type MemberRow = {
  key: string;
  kind: "staff" | "member";
  name: string;
  email?: string;
  personalEmail?: string;
  memberId?: string;
  roles: string[];
  role?: string;
  subtitle?: string;
  university?: string;
  metadata: Record<string, string>;
  photo?: string | null;
};

export const allMetadataFields = async (
  ctx: Parameters<typeof getProfile>[0]
): Promise<MetadataField[]> =>
  (await ctx.db.query("attendanceMetadata").collect()).sort(
    (a, b) => a.order - b.order
  );

export const staffDisplayName = (
  profile: Doc<"staffProfiles">,
  memberName?: string
): string => staffRowName(profile, memberName) ?? profile.email.split("@")[0];

export async function memberAuditName(
  ctx: QueryCtx | MutationCtx,
  member: Doc<"attendanceMembers">,
  year: number
): Promise<{ name: string; email: string | undefined }> {
  const profile = await staffProfileOfMember(ctx, member._id, year);
  return profile
    ? { name: staffDisplayName(profile, member.name), email: profile.email.toLowerCase() }
    : { name: member.name, email: undefined };
}

const staffSubtitle = (roles: string[]): string | undefined =>
  roles.length > 0 ? roles.join(" · ") : undefined;

type StaffSource = {
  profile: Doc<"staffProfiles">;
  shadow: Doc<"attendanceMembers"> | undefined;
};

const staffRowOf = (
  fields: readonly MetadataField[],
  viewingYear: number,
  { profile: p, shadow }: StaffSource
): MemberRow => {
  const metadata = staffLockedMetadata(fields, p, shadow?.metadata);
  const roles = rolesOfLike(p);
  const campuses = campusesLed(p);
  const metaSubtitle = metadataSubtitle(fields, metadata, viewingYear, [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY]);
  const subtitle = [staffSubtitle(roles), metaSubtitle].filter(Boolean).join(" · ");
  return {
    key: `staff:${p.email}`,
    kind: "staff",
    name: staffDisplayName(p, shadow?.name),
    email: p.email,
    personalEmail: shadow?.email,
    memberId: shadow?._id,
    roles,
    role: roles[0],
    subtitle: subtitle || undefined,
    university: resolveUniversity(fields, metadata, campuses),
    metadata,
  };
};

const memberRowOf = (
  fields: readonly MetadataField[],
  viewingYear: number,
  m: Doc<"attendanceMembers">,
  role: string
): MemberRow => {
  const metaSubtitle = metadataSubtitle(fields, m.metadata, viewingYear, [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY]);
  return {
    key: `member:${m._id}`,
    kind: "member",
    name: m.name,
    email: m.email,
    memberId: m._id,
    roles: [],
    role,
    subtitle: [role, metaSubtitle].filter(Boolean).join(" · "),
    university: resolveUniversity(fields, m.metadata),
    metadata: m.metadata ?? {},
  };
};

const withPhoto = async (ctx: QueryCtx, row: MemberRow, profile: Doc<"staffProfiles">): Promise<MemberRow> => {
  const user = profile.userId ? await ctx.db.get(profile.userId) : null;
  return { ...row, photo: await photoFor(ctx, user, profile.email) };
};

const staffSourcesOf = async (ctx: QueryCtx, year: number): Promise<StaffSource[]> => {
  const profiles = (
    await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()
  ).filter(isAssigned);
  return await Promise.all(
    profiles.map(async (profile) => ({
      profile,
      shadow: profile.memberId ? ((await ctx.db.get(profile.memberId)) ?? undefined) : undefined,
    }))
  );
};

const NAME_CURSOR = "name:";

type NameCursor = { staff: number; name: string | null; at: number | null };

const nameCursorOf = (cursor: string | null): NameCursor | null => {
  if (cursor === null) return { staff: 0, name: null, at: null };
  if (!cursor.startsWith(NAME_CURSOR)) return null;
  try {
    const { staff, name, at } = JSON.parse(cursor.slice(NAME_CURSOR.length)) as Partial<NameCursor>;
    if (typeof staff !== "number" || !Number.isInteger(staff) || staff < 0) return null;
    if (name === null && at === null) return { staff, name, at };
    return typeof name === "string" && typeof at === "number" ? { staff, name, at } : null;
  } catch {
    return null;
  }
};

const nameOrder = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

async function* oldestFirstWithinName(members: AsyncIterable<Doc<"attendanceMembers">>) {
  let run: Doc<"attendanceMembers">[] = [];
  for await (const member of members) {
    if (run.length > 0 && run[0].name !== member.name) {
      yield* run.reverse();
      run = [];
    }
    run.push(member);
  }
  yield* run.reverse();
}

async function* membersByNameAfter(ctx: QueryCtx, cursor: NameCursor, asc: boolean) {
  const { name, at } = cursor;
  const members = () => ctx.db.query("attendanceMembers");
  if (name !== null && at !== null) {
    yield* members().withIndex("by_name", (q) => q.eq("name", name).gt("_creationTime", at));
  }
  if (asc) {
    yield* name === null
      ? members().withIndex("by_name")
      : members().withIndex("by_name", (q) => q.gt("name", name));
    return;
  }
  yield* oldestFirstWithinName(
    name === null
      ? members().withIndex("by_name").order("desc")
      : members().withIndex("by_name", (q) => q.lt("name", name)).order("desc")
  );
}

async function pageByName(
  ctx: QueryCtx,
  opts: {
    year: number;
    asc: boolean;
    numItems: number;
    cursor: NameCursor;
    counted: number;
    fields: MetadataField[];
    viewingYear: number;
  }
) {
  const { asc, numItems, cursor, fields, viewingYear } = opts;
  const sources = await staffSourcesOf(ctx, opts.year);
  const staffIds = new Set(sources.flatMap((s) => (s.profile.memberId ? [s.profile.memberId] : [])));
  const linked = new Set(sources.flatMap((s) => (s.shadow ? [s.shadow._id] : [])));
  const staff = sources
    .map((source) => ({ source, row: staffRowOf(fields, viewingYear, source) }))
    .sort((a, b) => (asc ? nameOrder(a.row.name, b.row.name) : nameOrder(b.row.name, a.row.name)));

  const stream = membersByNameAfter(ctx, cursor, asc);
  let staffAt = cursor.staff;
  let last = { name: cursor.name, at: cursor.at };
  let held: Doc<"attendanceMembers"> | null = null;
  let streamDone = false;
  const peekMember = async () => {
    while (!held && !streamDone) {
      const next = await stream.next();
      if (next.done) streamDone = true;
      else if (staffIds.has(next.value._id)) last = { name: next.value.name, at: next.value._creationTime };
      else held = next.value;
    }
    return held;
  };
  const staffGoesFirst = (staffName: string, memberName: string) =>
    asc ? nameOrder(staffName, memberName) <= 0 : nameOrder(staffName, memberName) >= 0;

  const picked: ({ staff: (typeof staff)[number] } | { member: Doc<"attendanceMembers"> })[] = [];
  while (picked.length < numItems) {
    const member = await peekMember();
    const next = staff[staffAt];
    if (!member && !next) break;
    if (next && (!member || staffGoesFirst(next.row.name, member.name))) {
      picked.push({ staff: next });
      staffAt++;
    } else {
      picked.push({ member: member! });
      last = { name: member!.name, at: member!._creationTime };
      held = null;
    }
  }
  const more = staffAt < staff.length || (await peekMember()) !== null;
  const pageMembers = picked.flatMap((p) => ("member" in p ? [p.member] : []));
  const roleOf = await memberRolesFor(ctx, fields, pageMembers);
  const page = await Promise.all(
    picked.map((p) =>
      "member" in p
        ? memberRowOf(fields, viewingYear, p.member, roleOf(p.member).role)
        : withPhoto(ctx, p.staff.row, p.staff.source.profile)
    )
  );
  return {
    page,
    isDone: !more,
    continueCursor: more ? NAME_CURSOR + JSON.stringify({ staff: staffAt, ...last }) : "",
    total: sources.length + opts.counted - linked.size,
  };
}

const activeFilters = (filters: Record<string, string | string[]> | undefined) =>
  Object.entries(filters ?? {}).flatMap(([fieldId, raw]) => {
    const values = (Array.isArray(raw) ? raw : [raw]).filter((value) => value && value !== "all");
    return values.length > 0 ? [[fieldId, values] as const] : [];
  });

export const list = query({
  args: {
    year: v.number(),
    search: v.optional(v.string()),
    sortKey: v.optional(v.string()),
    sortAsc: v.optional(v.boolean()),
    filters: v.optional(
      v.record(v.string(), v.union(v.string(), v.array(v.string())))
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) {
      return { page: [], isDone: true, continueCursor: "", total: 0 };
    }
    const viewingYear = sydneyCalendarYear(new Date());
    const metadataFields = await allMetadataFields(ctx);
    const q = args.search?.trim().toLowerCase();
    const filters = activeFilters(args.filters);
    const sortKey = args.sortKey ?? "name";
    const { numItems, cursor } = args.paginationOpts;

    const nameCursor = nameCursorOf(cursor);
    if (!q && filters.length === 0 && sortKey === "name" && nameCursor) {
      const counted = await memberCount(ctx);
      if (counted !== null) {
        return await pageByName(ctx, {
          year: args.year,
          asc: args.sortAsc ?? true,
          numItems,
          cursor: nameCursor,
          counted,
          fields: metadataFields,
          viewingYear,
        });
      }
    }

    const yearField = metadataFields.find((f) => f.key === STUDENT_YEAR_FIELD_KEY);
    const roleField = metadataFields.find((f) => f.key === ROLE_FIELD_KEY);
    const roleOf = await memberRoleResolver(ctx, metadataFields);

    const sources = await staffSourcesOf(ctx, args.year);
    const members = await ctx.db.query("attendanceMembers").collect();
    const staffMemberIds = new Set(sources.flatMap((s) => (s.profile.memberId ? [s.profile.memberId] : [])));
    const pureExtras = members.filter((m) => !staffMemberIds.has(m._id));
    const profileByKey = new Map<string, Doc<"staffProfiles">>();
    const rows: MemberRow[] = [];

    for (const source of sources) {
      const row = staffRowOf(metadataFields, viewingYear, source);
      profileByKey.set(row.key, source.profile);
      rows.push(row);
    }
    for (const m of pureExtras) {
      rows.push(memberRowOf(metadataFields, viewingYear, m, roleOf(m).role));
    }

    let filtered = rows;
    if (q) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.email?.toLowerCase().includes(q) ?? false) ||
          (r.personalEmail?.includes(q) ?? false) ||
          (r.subtitle?.toLowerCase().includes(q) ?? false)
      );
    }

    const matchesFieldFilter = (
      row: MemberRow,
      fieldId: string,
      value: string
    ): boolean => {
      if (yearField && fieldId === yearField._id && yearField.values) {
        const stored = row.metadata[fieldId];
        const optionId = stored
          ? yearOptionIdForStoredValue(stored, viewingYear, yearField.values)
          : "";
        if (value === "unset") return optionId === "";
        return optionId === value;
      }
      if (roleField && fieldId === roleField._id) {
        const filterLabel = roleField.values?.[value] ?? value;
        return roleFilterMatches(
          filterLabel,
          row.roles,
          row.kind === "member" ? (row.role ?? null) : null
        );
      }
      if (value === "unset") return !row.metadata[fieldId];
      return row.metadata[fieldId] === value;
    };

    for (const [fieldId, values] of filters) {
      filtered = filtered.filter((row) =>
        values.some((value) => matchesFieldFilter(row, fieldId, value))
      );
    }

    const asc = args.sortAsc ?? true;
    const sortField = metadataFields.find((f) => f._id === sortKey);
    const metadataSortValue = (row: MemberRow): string => {
      if (roleField && sortKey === roleField._id) return row.role ?? "";
      const raw = row.metadata[sortKey] ?? "";
      if (!raw || !sortField) return raw;
      return (
        formatMetadataFieldValue(
          sortField.key,
          raw,
          viewingYear,
          sortField.values
        ) ?? ""
      );
    };
    filtered.sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === "name") {
        av = a.name;
        bv = b.name;
      } else if (yearField && sortKey === yearField._id) {
        av = yearMetadataSortKey(
          a.metadata[sortKey] ?? "",
          viewingYear,
          yearField.values
        );
        bv = yearMetadataSortKey(
          b.metadata[sortKey] ?? "",
          viewingYear,
          yearField.values
        );
      } else {
        av = metadataSortValue(a);
        bv = metadataSortValue(b);
      }
      const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      return asc ? cmp : -cmp;
    });

    const offset = Number(cursor);
    const start = cursor && Number.isInteger(offset) && offset > 0 ? offset : 0;
    const page = await Promise.all(
      filtered.slice(start, start + numItems).map((row) => {
        const profile = profileByKey.get(row.key);
        return profile ? withPhoto(ctx, row, profile) : row;
      })
    );
    const next = start + numItems;
    return {
      page,
      isDone: next >= filtered.length,
      continueCursor: next >= filtered.length ? "" : String(next),
      total: filtered.length,
    };
  },
});

export const get = query({
  args: {
    memberId: v.id("attendanceMembers"),
    staffYear: v.optional(v.number()),
  },
  handler: async (ctx, { memberId, staffYear }) => {
    if (!(await optionalProfile(ctx))) return null;
    const row = await ctx.db.get(memberId);
    if (!row) return null;
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const profile = await staffProfileOfMember(ctx, row._id, profileYear);
    const isStaffNow =
      (profile !== null && profileYear === currentStaffYear()) ||
      (await staffProfileOfMember(ctx, row._id, currentStaffYear())) !== null;
    const fields = await allMetadataFields(ctx);
    const { settings } = await readSettings(ctx);
    const roleRuleSettings = {
      regularShare: settings.regularShare,
      carryOverWeeklies: settings.carryOverWeeklies,
      newcomerPromoteWeeklies: settings.newcomerPromoteWeeklies,
      visitorMinWeeklies: settings.visitorMinWeeklies,
    };
    if (!profile) {
      const roleOf = await memberRoleResolver(ctx, fields);
      return {
        ...row,
        isStaffOverlay: false,
        isStaffNow,
        nameLocked: false,
        personalEmail: undefined as string | undefined,
        profileChurch: null,
        role: roleOf(row),
        roleRuleSettings,
      };
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", profile.email.toLowerCase()))
      .first();
    const church = user?.churchId ? await ctx.db.get("churches", user.churchId) : null;
    return {
      ...row,
      isStaffOverlay: true,
      isStaffNow,
      nameLocked: profileOwnName(profile) !== null,
      name: staffRowName(profile, row.name) ?? "",
      email: profile.email,
      personalEmail: row.email,
      metadata: staffLockedMetadata(fields, profile, row.metadata),
      profileChurch: church?.name ?? null,
      role: (() => {
        const staff = memberRole({ staffRole: rolesOfLike(profile)[0] });
        return { ...staff, marked: null, automatic: staff };
      })(),
      roleRuleSettings,
    };
  },
});

const NAME_MATCH_LIMIT = 50;

export const byName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (!(await optionalProfile(ctx))) return [];
    const trimmed = name.trim();
    if (!trimmed) return [];
    const exact = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .take(NAME_MATCH_LIMIT);
    const normalized = trimmed.toLowerCase();
    const members =
      exact.length > 0
        ? exact
        : (
            await ctx.db
              .query("attendanceMembers")
              .withSearchIndex("search_name", (q) => q.search("name", trimmed))
              .take(NAME_MATCH_LIMIT)
          ).filter((m) => m.name.trim().toLowerCase() === normalized);
    return members
      .map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email,
        metadata: m.metadata ?? {},
      }));
  },
});

export const ensureForStaff = mutation({
  args: { staffEmail: v.string(), staffYear: v.optional(v.number()) },
  handler: async (ctx, { staffEmail, staffYear }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    if (!canonicalEmailKey(staffEmail)) {
      throw new ConvexError("Staff email is required.");
    }
    const profile = await assignedProfileForEmail(
      ctx,
      staffEmail,
      staffYear ?? staffYearForDate(new Date())
    );
    if (!profile) throw new ConvexError("Staff profile not found.");
    return await linkOrCreateMember(ctx, profile, actorEmail);
  },
});

const staffEmailMessage = (profile: Doc<"staffProfiles">) =>
  `${profile.email} is ${personDisplayName(profile.name, profile.email)}'s staff email. Use Merge instead.`;

export const staffForEmail = query({
  args: { email: v.string(), staffYear: v.optional(v.number()) },
  handler: async (ctx, { email, staffYear }) => {
    if (!(await optionalProfile(ctx))) return null;
    if (!canonicalEmailKey(email)) return null;
    const profile = await staffProfileForEmail(
      ctx,
      email,
      staffYear ?? staffYearForDate(new Date())
    );
    return profile
      ? {
          email: profile.email.toLowerCase(),
          name: personDisplayName(profile.name, profile.email),
        }
      : null;
  },
});

async function checkedChurch(ctx: Ctx, churchId: Id<"churches"> | null | undefined) {
  if (churchId && !(await ctx.db.get("churches", churchId))) {
    throw new ConvexError("That church isn't in the list any more.");
  }
  return churchId;
}

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    churchId: v.optional(v.id("churches")),
  },
  handler: async (ctx, { name, email, metadata, churchId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const trimmed = capitalizeMemberName(name.trim());
    if (!trimmed) throw new ConvexError("Name is required.");
    if (canonicalEmailKey(email)) {
      const staff = await latestStaffProfile(ctx, email);
      if (staff) {
        throw new ConvexError(
          `${staff.email} is ${personDisplayName(staff.name, staff.email)}'s staff email. They're already in the list as staff.`
        );
      }
      if (isSowStaffAddress(email)) throw new ConvexError(NOT_PERSONAL(email!.trim().toLowerCase()));
    }
    const memberId = await insertMember(ctx, {
      name: trimmed,
      email: email?.trim().toLowerCase() || undefined,
      metadata: metadata && withMarkedRole(await allMetadataFields(ctx), metadata, undefined),
      churchId: (await checkedChurch(ctx, churchId)) ?? undefined,
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.create",
      summary: `Created member "${trimmed}"`,
      memberId,
    });
    return memberId;
  },
});

export const update = mutation({
  args: {
    memberId: v.id("attendanceMembers"),
    name: v.string(),
    email: v.optional(v.string()),
    personalEmail: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    staffYear: v.optional(v.number()),
    churchId: v.optional(v.union(v.id("churches"), v.null())),
  },
  handler: async (ctx, { memberId, name, email, personalEmail, metadata, staffYear, churchId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) throw new ConvexError("Member not found.");
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const profile = await staffProfileOfMember(ctx, memberId, profileYear);
    if (profile) {
      const personal = personalEmail?.trim().toLowerCase() || undefined;
      if (personal && (await isStaffAddress(ctx, personal))) {
        throw new ConvexError(NOT_PERSONAL(personal));
      }
      const staffName = profileOwnName(profile) ?? personName(name);
      if (!staffName) throw new ConvexError("Name is required.");
      const fields = await allMetadataFields(ctx);
      const staffMetadata = memberOwnMetadata(fields, metadata, row.metadata);
      if (
        staffName === row.name &&
        personal === row.email &&
        sameMetadata(staffMetadata, row.metadata)
      ) {
        return;
      }
      await ctx.db.patch(memberId, {
        name: staffName,
        email: personal,
        metadata: staffMetadata,
      });
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "member",
        action: "member.update",
        summary: `Updated member "${staffName}"`,
        memberId,
        subjectEmail: profile.email,
      });
      return;
    }
    const staffNow = await staffProfileOfMember(ctx, memberId, currentStaffYear());
    const newKey = canonicalEmailKey(email);
    if (newKey && newKey !== canonicalEmailKey(row.email)) {
      const staff = await staffProfileForEmail(ctx, email!, profileYear);
      if (staff) throw new ConvexError(staffEmailMessage(staff));
    }
    const trimmed = capitalizeMemberName(name.trim());
    if (!trimmed) throw new ConvexError("Name is required.");
    const ownEmail = email?.trim().toLowerCase() || undefined;
    if (ownEmail && (await isStaffAddress(ctx, ownEmail))) {
      throw new ConvexError(NOT_PERSONAL(ownEmail));
    }
    const fields = await allMetadataFields(ctx);
    const nextMetadata = staffNow
      ? memberOwnMetadata(fields, metadata, row.metadata)
      : withMarkedRole(fields, metadata, row.metadata);
    const nextChurch =
      churchId === undefined ? row.churchId : ((await checkedChurch(ctx, churchId)) ?? undefined);
    if (
      trimmed === row.name &&
      ownEmail === row.email &&
      nextChurch === row.churchId &&
      sameMetadata(nextMetadata, row.metadata)
    ) {
      return;
    }
    await ctx.db.patch(memberId, {
      name: trimmed,
      email: ownEmail,
      metadata: nextMetadata,
      ...(churchId === undefined ? {} : { churchId: nextChurch }),
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.update",
      summary: `Updated member "${trimmed}"`,
      memberId,
    });
  },
});

export const remove = mutation({
  args: { memberId: v.id("attendanceMembers") },
  handler: async (ctx, { memberId }): Promise<boolean> => {
    const { email: actorEmail } = await requireAdmin(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) return false;
    if (await staffProfileOfMember(ctx, memberId, currentStaffYear())) {
      throw new ConvexError(
        `${row.name} is on staff this year. Remove their staff role in Admin before deleting them.`
      );
    }
    const signed = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();

    const listed = signed
      .slice()
      .sort((a, b) => b.signInTime - a.signInTime)
      .slice(0, MAX_AUDIT_ATTENDANCE_LINES);

    const eventNames = new Map<string, string>();
    for (const record of listed) {
      if (eventNames.has(record.eventId)) continue;
      const event = await ctx.db.get(record.eventId);
      eventNames.set(record.eventId, event?.name ?? "Deleted event");
    }

    const shown = listed.map(
      (record) =>
        `${eventNames.get(record.eventId)} · ${auditStamp(record.signInTime)}`
    );
    const hidden = signed.length - shown.length;

    for (const s of signed) await ctx.db.delete(s._id);
    for (const eventId of new Set(signed.map((s) => s.eventId))) {
      await recountEventAttendance(ctx, eventId);
    }
    for (const profile of await profilesOfMember(ctx, memberId)) {
      await ctx.db.patch("staffProfiles", profile._id, { memberId: undefined });
    }
    await deleteMember(ctx, memberId);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.delete",
      summary: `Deleted member "${row.name}"`,
      memberId,
      subjectEmail: row.email,
      detail: signed.length
        ? [
            `Removed ${signed.length} attendance record${
              signed.length === 1 ? "" : "s"
            }:`,
            ...shown,
            ...(hidden > 0 ? [`and ${hidden} more`] : []),
          ].join("\n")
        : "Removed no attendance records",
    });
    return true;
  },
});

export const deletePreview = query({
  args: { memberId: v.id("attendanceMembers") },
  handler: async (ctx, { memberId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const row = await ctx.db.get(memberId);
    if (!row) return null;
    const signed = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
    const listed = signed
      .slice()
      .sort((a, b) => b.signInTime - a.signInTime)
      .slice(0, MAX_AUDIT_ATTENDANCE_LINES);
    const events = [];
    for (const record of listed) {
      const event = await ctx.db.get(record.eventId);
      events.push({
        attendanceId: record._id,
        name: event?.name ?? "Deleted event",
        dateStart: event?.dateStart ?? record.signInTime,
      });
    }
    return { total: signed.length, events };
  },
});

const mergeKeepValidator = v.union(
  v.object({ memberId: v.id("attendanceMembers") }),
  v.object({ staffEmail: v.string() })
);

type MergeKeep =
  | { kind: "member"; row: Doc<"attendanceMembers"> }
  | {
      kind: "staff";
      profile: Doc<"staffProfiles">;
      email: string;
      row: Doc<"attendanceMembers"> | null;
    };

type MergePair =
  | { blocked: string }
  | { remove: Doc<"attendanceMembers">; keep: MergeKeep };

const staffYearsToCheck = (profileYear: number): number[] => {
  const now = staffYearForDate(new Date());
  return [...new Set([profileYear, now, now + 1])];
};

export const isStaffAddress = async (ctx: Ctx, email: string | undefined): Promise<boolean> =>
  isSowStaffAddress(email) || Boolean(await latestStaffProfile(ctx, email));

const NOT_PERSONAL = (email: string) =>
  `${email} is a staff email, not a personal one. Add their personal email instead.`;

export const latestStaffProfile = async (
  ctx: Ctx,
  email: string | undefined
): Promise<Doc<"staffProfiles"> | null> => {
  for (const candidate of staffEmailCandidates(email)) {
    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", candidate))
      .order("desc")
      .first();
    if (profile) return profile;
  }
  return null;
};

const staffProfileForEmail = async (
  ctx: Ctx,
  email: string,
  profileYear: number
): Promise<Doc<"staffProfiles"> | null> => {
  for (const year of staffYearsToCheck(profileYear)) {
    for (const candidate of staffEmailCandidates(email)) {
      const profile = await getProfile(ctx, candidate, year);
      if (profile) return profile;
    }
  }
  return await latestStaffProfile(ctx, email);
};

export const staffYearsOf = async (ctx: Ctx, memberId: Id<"attendanceMembers"> | undefined) =>
  memberId
    ? new Set((await profilesOfMember(ctx, memberId)).filter(isAssigned).map((p) => p.year))
    : new Set<number>();

const resolveMergePair = async (
  ctx: Ctx,
  removeId: Id<"attendanceMembers">,
  keepArg: { memberId: Id<"attendanceMembers"> } | { staffEmail: string },
  profileYear: number
): Promise<MergePair> => {
  const remove = await ctx.db.get(removeId);
  if (!remove) return { blocked: "That member no longer exists." };
  if (await staffProfileOfMember(ctx, remove._id, profileYear)) {
    return {
      blocked: `${remove.name} is staff, so can't be merged away. Merge the member into them instead.`,
    };
  }

  let keep: MergeKeep;
  if ("memberId" in keepArg) {
    const keepRow = await ctx.db.get(keepArg.memberId);
    if (!keepRow) return { blocked: "The person to keep no longer exists." };
    const profile = await staffProfileOfMember(ctx, keepRow._id, profileYear);
    keep = profile
      ? { kind: "staff", profile, email: profile.email.toLowerCase(), row: keepRow }
      : { kind: "member", row: keepRow };
  } else {
    const profile = await staffProfileForEmail(ctx, keepArg.staffEmail, profileYear);
    if (!profile) return { blocked: "Staff profile not found." };
    const linked = await knownMemberId(ctx, profile);
    keep = {
      kind: "staff",
      profile,
      email: profile.email.toLowerCase(),
      row: linked ? await ctx.db.get(linked) : null,
    };
  }
  if (keep.row?._id === remove._id) {
    return { blocked: "Pick two different people to merge." };
  }
  const keepYears = await staffYearsOf(ctx, keep.row?._id);
  if (keep.kind === "staff") keepYears.add(keep.profile.year);
  const clash = [...(await staffYearsOf(ctx, remove._id))]
    .filter((year) => keepYears.has(year))
    .sort((a, b) => a - b)[0];
  if (clash !== undefined) {
    return {
      blocked: `${remove.name} and the person you're keeping were both staff in ${clash}, so they're different people.`,
    };
  }
  return { remove, keep };
};

const keepSide = (keep: MergeKeep, fields: MetadataField[]): MergeSide =>
  keep.kind === "member"
    ? {
        name: keep.row.name,
        email: keep.row.email,
        metadata: keep.row.metadata ?? {},
      }
    : {
        name: staffDisplayName(keep.profile, keep.row?.name),
        email: keep.email,
        metadata: staffLockedMetadata(fields, keep.profile, keep.row?.metadata),
      };

const removeSide = (row: Doc<"attendanceMembers">): MergeSide => ({
  name: row.name,
  email: row.email,
  metadata: row.metadata ?? {},
});

const mergeOptionsFor = (keep: MergeKeep, fields: MetadataField[]) => {
  const viewingYear = sydneyCalendarYear(new Date());
  const shown = (fieldId: string, value: string) => {
    const field = fields.find((f) => f._id === fieldId)!;
    const label = formatMetadataFieldValue(field.key, value, viewingYear, field.values) ?? value;
    return (field.key === ROLE_FIELD_KEY ? (markedRoleOf(label) ?? "") : label)
      .trim()
      .toLowerCase();
  };
  return {
    sameValue: (fieldId: string, a: string, b: string) =>
      a === b || shown(fieldId, a) === shown(fieldId, b),
    ...(keep.kind === "staff"
      ? {
          identityLocked: true,
          lockedFieldIds: fields
            .filter((f) => f.key === CAMPUS_FIELD_KEY || f.key === ROLE_FIELD_KEY)
            .map((f) => f._id as string),
        }
      : {}),
  };
};

const keptPersonalEmail = async (
  ctx: Ctx,
  keep: Extract<MergeKeep, { kind: "staff" }>,
  remove: Doc<"attendanceMembers">
): Promise<string | undefined> => {
  for (const candidate of [keep.row?.email, remove.email]) {
    const email = candidate?.trim().toLowerCase();
    if (email && !(await isStaffAddress(ctx, email))) return email;
  }
  return undefined;
};

type History = { events: number; lastAttended: number | null };

const historyOf = (rows: Doc<"attendance">[]): History => {
  const events = new Set(rows.map((r) => r.eventId));
  const last = rows.reduce<number | null>(
    (max, r) => (max === null || r.signInTime > max ? r.signInTime : max),
    null
  );
  return { events: events.size, lastAttended: last };
};

const recordsOf = async (ctx: Ctx, memberId: Id<"attendanceMembers"> | undefined) =>
  memberId
    ? await ctx.db
        .query("attendance")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .collect()
    : [];

const survivorOf = (
  a: { row: Doc<"attendanceMembers">; records: Doc<"attendance">[] },
  b: { row: Doc<"attendanceMembers">; records: Doc<"attendance">[] }
) => {
  const aEvents = historyOf(a.records).events;
  const bEvents = historyOf(b.records).events;
  if (aEvents !== bEvents) return aEvents > bEvents ? [a, b] : [b, a];
  return a.row._creationTime <= b.row._creationTime ? [a, b] : [b, a];
};

export const mergePreview = query({
  args: {
    removeId: v.id("attendanceMembers"),
    keep: mergeKeepValidator,
    staffYear: v.optional(v.number()),
  },
  handler: async (ctx, { removeId, keep: keepArg, staffYear }) => {
    if (!(await optionalProfile(ctx))) return null;
    const pair = await resolveMergePair(
      ctx,
      removeId,
      keepArg,
      staffYear ?? staffYearForDate(new Date())
    );
    if ("blocked" in pair) return { blocked: pair.blocked } as const;
    const { remove, keep } = pair;
    const fields = await allMetadataFields(ctx);
    const kept = keepSide(keep, fields);
    const removed = removeSide(remove);
    const conflicts: MergeConflict[] = detectMergeConflicts(
      kept,
      removed,
      fields,
      mergeOptionsFor(keep, fields)
    );
    const records = await recordsOf(ctx, remove._id);
    const keptRecords = await recordsOf(ctx, keep.row?._id);
    const keptEvents = new Set(keptRecords.map((r) => r.eventId));
    const shared = records.filter((r) => keptEvents.has(r.eventId)).length;
    return {
      keep: {
        kind: keep.kind,
        ...kept,
        personalEmail:
          keep.kind === "staff" ? await keptPersonalEmail(ctx, keep, remove) : undefined,
        history: historyOf(keptRecords),
      },
      remove: { ...removed, history: historyOf(records) },
      conflicts,
      attendance: {
        total: records.length,
        shared,
        moved: records.length - shared,
      },
    };
  },
});

export const merge = mutation({
  args: {
    removeId: v.id("attendanceMembers"),
    keep: mergeKeepValidator,
    resolutions: v.record(
      v.string(),
      v.union(v.literal("keep"), v.literal("remove"))
    ),
    staffYear: v.optional(v.number()),
  },
  handler: async (ctx, { removeId, keep: keepArg, resolutions, staffYear }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const pair = await resolveMergePair(
      ctx,
      removeId,
      keepArg,
      staffYear ?? staffYearForDate(new Date())
    );
    if ("blocked" in pair) throw new ConvexError(pair.blocked);
    const { remove, keep } = pair;
    const fields = await allMetadataFields(ctx);
    const kept = keepSide(keep, fields);
    const merged = buildMergedFields(
      kept,
      removeSide(remove),
      fields,
      resolutions,
      mergeOptionsFor(keep, fields)
    );
    const keptName = keep.kind === "member" ? merged.name : kept.name;
    const taken = fieldsTakenFromRemoved(kept, merged, fields);

    const fieldsFor = async () =>
      keep.kind === "member"
        ? { name: merged.name, email: merged.email, metadata: merged.metadata }
        : {
            name:
              staffRowName(keep.profile, keep.row?.name, remove.name) ?? staffMemberName(keep.profile),
            email: await keptPersonalEmail(ctx, keep, remove),
            metadata: memberOwnMetadata(fields, merged.metadata, {
              ...(remove.metadata ?? {}),
              ...(keep.row?.metadata ?? {}),
            }),
          };

    if (!keep.row) {
      const staff = keep as Extract<MergeKeep, { kind: "staff" }>;
      await ctx.db.patch(remove._id, await fieldsFor());
      await linkPerson(ctx, staff.profile, remove._id);
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "member",
        action: "member.merge",
        summary: `Merged "${remove.name}" into staff "${keptName}"`,
        memberId: remove._id,
        subjectEmail: staff.email,
        detail: [
          `Linked ${keptName}'s staff profile to "${remove.name}", so their attendance stays where it is`,
          ...(taken.length ? [`Took from "${remove.name}": ${taken.join(", ")}`] : []),
        ].join("\n"),
      });
      return { moved: 0, combined: 0 };
    }

    const [survivor, victim] = survivorOf(
      { row: keep.row, records: await recordsOf(ctx, keep.row._id) },
      { row: remove, records: await recordsOf(ctx, remove._id) }
    );
    const { moved, combined } = await moveAttendance(ctx, victim.row._id, survivor.row._id);
    await ctx.db.patch(survivor.row._id, {
      ...(await fieldsFor()),
      churchId: keep.row.churchId ?? remove.churchId,
    });
    await deleteMember(ctx, victim.row._id);

    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.merge",
      summary: `Merged "${remove.name}" into ${keep.kind === "staff" ? "staff " : ""}"${keptName}"`,
      memberId: survivor.row._id,
      subjectEmail: keep.kind === "staff" ? keep.email : merged.email,
      detail: [
        `Moved ${moved} attendance record${moved === 1 ? "" : "s"}` +
          (combined
            ? `; combined ${combined} event${combined === 1 ? "" : "s"} both were signed in to`
            : ""),
        ...(taken.length ? [`Took from "${remove.name}": ${taken.join(", ")}`] : []),
        `Removed member "${remove.name}" (${victim.row._id})`,
      ].join("\n"),
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.mergedAway",
      summary: `"${remove.name}" was merged into "${keptName}"`,
      memberId: victim.row._id,
      detail: `Kept as ${survivor.row._id}`,
    });
    return { moved, combined };
  },
});
