import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  assignmentsOf,
  roleNeedsUniversity,
  rolesOfLike,
  staffYearForDate,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
  memberOwnMetadata,
  type MetadataFieldLike as MetadataField,
  metadataSubtitle,
  resolveUniversity,
  ROLE_FIELD_KEY,
  roleFilterMatches,
  staffLockedMetadata,
  STUDENT_YEAR_FIELD_KEY,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "../shared/attendanceMemberMeta";
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
import { currentStaffYear, getProfile, optionalProfile, requireAdmin, requireProfile } from "./model";
import {
  auditStamp,
  logAttendanceAction,
  MAX_AUDIT_ATTENDANCE_LINES,
} from "./attendanceAudit";
import { Doc, Id } from "./_generated/dataModel";
import { photoFor } from "./photo";
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
  /** A staff person's own email, alongside their staff one. */
  personalEmail?: string;
  memberId?: string;
  roles: string[];
  subtitle?: string;
  university?: string;
  metadata: Record<string, string>;
  photo?: string | null;
};

const allMetadataFields = async (
  ctx: Parameters<typeof getProfile>[0]
): Promise<MetadataField[]> =>
  (await ctx.db.query("attendanceMetadata").collect()).sort(
    (a, b) => a.order - b.order
  );

const staffSubtitle = (roles: string[]): string | undefined =>
  roles.length > 0 ? roles.join(" · ") : undefined;

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
      return { page: [], isDone: true, continueCursor: "" };
    }
    const viewingYear = sydneyCalendarYear(new Date());
    const metadataFields = await allMetadataFields(ctx);
    const yearField = metadataFields.find((f) => f.key === STUDENT_YEAR_FIELD_KEY);
    const roleField = metadataFields.find((f) => f.key === ROLE_FIELD_KEY);

    const profiles = (
      await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .collect()
    ).filter(isAssigned);
    const members = await ctx.db.query("attendanceMembers").collect();
    const memberById = new Map(members.map((m) => [m._id, m]));
    const staffMemberIds = new Set(profiles.flatMap((p) => (p.memberId ? [p.memberId] : [])));
    const pureExtras = members.filter((m) => !staffMemberIds.has(m._id));

    const rows: MemberRow[] = [];

    for (const p of profiles) {
      const shadow = p.memberId ? memberById.get(p.memberId) : undefined;
      const metadata = staffLockedMetadata(metadataFields, p, shadow?.metadata);
      const assignments = assignmentsOf(p);
      const roles = rolesOfLike(p);
      const campuses = [
        ...new Set(
          assignments.flatMap((a) =>
            a.university && roleNeedsUniversity(a.role) ? [a.university] : []
          )
        ),
      ];
      const user = p.userId ? await ctx.db.get(p.userId) : null;
      const orgSubtitle = staffSubtitle(roles);
      const metaSubtitle = metadataSubtitle(
        metadataFields,
        metadata,
        viewingYear,
        [CAMPUS_FIELD_KEY, ROLE_FIELD_KEY]
      );
      const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
      const university = resolveUniversity(
        metadataFields,
        metadata,
        campuses
      );
      rows.push({
        key: `staff:${p.email}`,
        kind: "staff",
        name: staffRowName(p, shadow?.name) ?? personDisplayName(p.name, p.email),
        email: p.email,
        personalEmail: shadow?.email,
        memberId: shadow?._id,
        roles,
        subtitle: subtitle || undefined,
        university,
        metadata,
        photo: await photoFor(ctx, user, p.email),
      });
    }

    for (const m of pureExtras) {
      const university = resolveUniversity(metadataFields, m.metadata);
      rows.push({
        key: `member:${m._id}`,
        kind: "member",
        name: m.name,
        email: m.email,
        memberId: m._id,
        roles: [],
        subtitle: metadataSubtitle(metadataFields, m.metadata, viewingYear, [CAMPUS_FIELD_KEY]),
        university,
        metadata: m.metadata ?? {},
      });
    }

    let filtered = rows;
    const q = args.search?.trim().toLowerCase();
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
      if (value === "unset") return !row.metadata[fieldId];
      if (roleField && fieldId === roleField._id) {
        const filterLabel = roleField.values?.[value] ?? value;
        const stored = row.metadata[fieldId];
        const metadataRoleLabel = stored
          ? formatMetadataFieldValue(
              roleField.key,
              stored,
              viewingYear,
              roleField.values
            )
          : null;
        return roleFilterMatches(filterLabel, row.roles, metadataRoleLabel);
      }
      return row.metadata[fieldId] === value;
    };

    if (args.filters) {
      for (const [fieldId, rawValue] of Object.entries(args.filters)) {
        const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).filter(
          (value) => value && value !== "all"
        );
        if (values.length === 0) continue;
        filtered = filtered.filter((row) =>
          values.some((value) => matchesFieldFilter(row, fieldId, value))
        );
      }
    }

    const asc = args.sortAsc ?? true;
    const sortKey = args.sortKey ?? "name";
    const sortField = metadataFields.find((f) => f._id === sortKey);
    const metadataSortValue = (row: MemberRow): string => {
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

    const { numItems, cursor } = args.paginationOpts;
    const start = cursor ? Number(cursor) : 0;
    const page = filtered.slice(start, start + numItems);
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
    if (!profile) {
      return {
        ...row,
        isStaffOverlay: false,
        isStaffNow,
        nameLocked: false,
        personalEmail: undefined as string | undefined,
        profileChurch: null,
      };
    }
    const fields = await allMetadataFields(ctx);
    // Staff pick their church in their own Profile; the sheet just shows it.
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
    };
  },
});

export const byName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (!(await optionalProfile(ctx))) return [];
    const trimmed = name.trim();
    if (!trimmed) return [];
    // Exact matches come straight off the index; the case-insensitive
    // fallback only scans when nothing matched exactly.
    const exact = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .take(50);
    const normalized = trimmed.toLowerCase();
    const members =
      exact.length > 0
        ? exact
        : (await ctx.db.query("attendanceMembers").collect()).filter(
            (m) => m.name.trim().toLowerCase() === normalized
          );
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

/** Typing a staff email onto a plain member used to relabel the row as that
 *  staff person without moving its attendance, splitting their history (and
 *  leaving a hidden duplicate if they already had a row). Merge does it
 *  properly, so the Email field points there instead. */
const staffEmailMessage = (profile: Doc<"staffProfiles">) =>
  `${profile.email} is ${personDisplayName(profile.name, profile.email)}'s staff email. Use Merge instead.`;

/** The staff person an email belongs to, if any — lets the edit sheet offer
 *  Merge before the save is refused. */
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

/** A member's church from the list: checked to still be there. */
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
    // A member can't carry a staff email: that person is already listed as
    // staff, and their attendance is keyed by that email.
    if (canonicalEmailKey(email)) {
      const staff = await latestStaffProfile(ctx, email);
      if (staff) {
        throw new ConvexError(
          `${staff.email} is ${personDisplayName(staff.name, staff.email)}'s staff email. They're already in the list as staff.`
        );
      }
      if (isSowStaffAddress(email)) throw new ConvexError(NOT_PERSONAL(email!.trim().toLowerCase()));
    }
    const memberId = await ctx.db.insert("attendanceMembers", {
      name: trimmed,
      email: email?.trim().toLowerCase() || undefined,
      metadata,
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
    /** A staff person's own email; ignored for plain members. */
    personalEmail: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    staffYear: v.optional(v.number()),
    /** A plain member's church; null clears it, left out keeps it. Staff
     *  set theirs in their own Profile, so it's ignored for them. */
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
      await ctx.db.patch(memberId, {
        name: staffName,
        email: personal,
        metadata: memberOwnMetadata(fields, metadata, row.metadata),
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
    // A plain member's email is their own; a staff one (say a former
    // leader's old SOW address, or one an import brought in) would make them
    // read as staff, so it has to be replaced or cleared before saving.
    if (ownEmail && (await isStaffAddress(ctx, ownEmail))) {
      throw new ConvexError(NOT_PERSONAL(ownEmail));
    }
    await ctx.db.patch(memberId, {
      name: trimmed,
      email: ownEmail,
      metadata: staffNow ? memberOwnMetadata(await allMetadataFields(ctx), metadata, row.metadata) : metadata,
      ...(churchId === undefined ? {} : { churchId: (await checkedChurch(ctx, churchId)) ?? undefined }),
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
    // Deleting throws attendance away for good; leaders merge duplicates
    // instead, and only admins (Data and IT, HR, the Governance head, the
    // Director) can delete.
    const { email: actorEmail } = await requireAdmin(ctx);
    const row = await ctx.db.get(memberId);
    // Someone else may have deleted or merged them first; say so rather than
    // letting the caller report a deletion that didn't happen here.
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

    // Only the records that will actually be listed need a name, so the reads
    // are bounded by the line cap rather than by how long the member has been
    // around. Resolving every event first would spend one db.get per event
    // against Convex's per-mutation index-range-read budget to produce names
    // that get sliced off anyway.
    const listed = signed
      .slice()
      .sort((a, b) => b.signInTime - a.signInTime)
      .slice(0, MAX_AUDIT_ATTENDANCE_LINES);

    // Named while their attendance rows still exist, once per distinct event.
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
    for (const profile of await profilesOfMember(ctx, memberId)) {
      await ctx.db.patch("staffProfiles", profile._id, { memberId: undefined });
    }
    await ctx.db.delete(memberId);
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

/** What deleting a member takes with them, so the confirm sheet can name every
 *  event instead of a vague "their attendance". */
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

type Ctx = QueryCtx | MutationCtx;

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

/** Someone's most recent staff profile in any year. Former staff are still
 *  staff here: their attendance is keyed by their org email. */
/** A staff email rather than a personal one: an SOW address, or anyone's
 *  staff email in any year. Personal emails (a staff person's own, a plain
 *  member's) can't be one. */
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

/** The staff profile to use for this email: the one for the year being viewed
 *  (or this / next staff year) when there is one, else their latest. */
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

const staffYearsOf = async (ctx: Ctx, memberId: Id<"attendanceMembers"> | undefined) =>
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
        name: staffRowName(keep.profile, keep.row?.name) ?? personDisplayName(keep.profile.name, keep.email),
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
    return (
      formatMetadataFieldValue(field.key, value, viewingYear, field.values) ?? value
    )
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
    await ctx.db.delete(victim.row._id);

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
        `Removed member "${victim.row.name}" (${victim.row._id})`,
      ].join("\n"),
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.mergedAway",
      summary: `"${victim.row.name}" was merged into "${keptName}"`,
      memberId: victim.row._id,
      detail: `Kept as ${survivor.row._id}`,
    });
    return { moved, combined };
  },
});
