import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  assignmentsOf,
  roleNeedsUniversity,
  rolesOfLike,
  staffYearForDate,
  sydneyCalendarYear,
  SYDNEY_TIME_ZONE,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
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
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import {
  buildMergedFields,
  detectMergeConflicts,
  type MergeConflict,
  type MergeSide,
  mergeNotes,
} from "../shared/memberMerge";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  findMemberByEmail,
  getProfile,
  optionalProfile,
  requireProfile,
} from "./model";
import { logAttendanceAction } from "./attendanceAudit";
import { Doc, Id } from "./_generated/dataModel";

export type MemberRow = {
  key: string;
  kind: "staff" | "member";
  name: string;
  email?: string;
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

const staffOverlayProfile = async (
  ctx: Parameters<typeof getProfile>[0],
  row: Doc<"attendanceMembers">,
  profileYear: number,
  emailOverride?: string
): Promise<Doc<"staffProfiles"> | null> => {
  const emails = [row.email, emailOverride].filter(
    (value): value is string => Boolean(value)
  );
  const seen = new Set<string>();
  for (const email of emails) {
    for (const candidate of staffEmailCandidates(email)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const profile = await getProfile(ctx, candidate, profileYear);
      if (profile) return profile;
    }
  }
  return null;
};

const isStaffOverlayRow = async (
  ctx: Parameters<typeof getProfile>[0],
  row: Doc<"attendanceMembers">,
  profileYear: number,
  emailOverride?: string
): Promise<boolean> => {
  const now = staffYearForDate(new Date());
  for (const year of new Set([profileYear, now, now + 1])) {
    if (await staffOverlayProfile(ctx, row, year, emailOverride)) return true;
  }
  return false;
};

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

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .collect();
    const extra = await ctx.db
      .query("attendanceMembers")
      .collect();

    const profileKeys = new Set(
      profiles.flatMap((p) => {
        const key = canonicalEmailKey(p.email);
        return key ? [key] : [];
      })
    );
    const memberProfileKey = (m: (typeof extra)[number]): string | undefined => {
      const key = canonicalEmailKey(m.email);
      return key && profileKeys.has(key) ? key : undefined;
    };
    const shadowByKey = new Map<string, (typeof extra)[number]>();
    const pureExtras: typeof extra = [];
    for (const m of extra) {
      const key = memberProfileKey(m);
      if (key) {
        if (!shadowByKey.has(key)) shadowByKey.set(key, m);
        continue;
      }
      pureExtras.push(m);
    }

    const rows: MemberRow[] = [];

    for (const p of profiles) {
      const profileKey = canonicalEmailKey(p.email);
      const shadow = profileKey ? shadowByKey.get(profileKey) : undefined;
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
        kind: assignments.length > 0 ? "staff" : "member",
        name: personDisplayName(p.name, p.email),
        email: p.email,
        memberId: shadow?._id,
        roles,
        subtitle: subtitle || undefined,
        university,
        metadata,
        photo: user?.image ?? null,
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
    const profile = await staffOverlayProfile(ctx, row, profileYear);
    if (!profile) return { ...row, isStaffOverlay: false };
    const fields = await allMetadataFields(ctx);
    return {
      ...row,
      isStaffOverlay: true,
      name: profile.name ?? row.name,
      email: profile.email,
      metadata: staffLockedMetadata(fields, profile, row.metadata),
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
    const profileYear = staffYear ?? staffYearForDate(new Date());
    let profile: Awaited<ReturnType<typeof getProfile>> = null;
    for (const candidate of staffEmailCandidates(staffEmail)) {
      profile = await getProfile(ctx, candidate, profileYear);
      if (profile) break;
    }
    if (!profile) throw new ConvexError("Staff profile not found.");
    const linkEmail = profile.email.toLowerCase();
    const existing = await findMemberByEmail(ctx, linkEmail);
    if (existing) return existing._id;
    const fields = await allMetadataFields(ctx);
    const memberId = await ctx.db.insert("attendanceMembers", {
      name: profile.name ?? linkEmail,
      email: linkEmail,
      metadata: staffLockedMetadata(fields, profile, {}),
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.create",
      summary: `Added staff member "${profile.name ?? linkEmail}" to the attendance pool`,
      memberId,
      subjectEmail: linkEmail,
    });
    return memberId;
  },
});

/** Typing a staff email onto a plain member used to relabel the row as that
 *  staff person without moving its attendance, splitting their history (and
 *  leaving a hidden duplicate if they already had a row). Merge does it
 *  properly, so the Email field points there instead. */
const staffEmailMessage = (profile: Doc<"staffProfiles">) =>
  `${profile.email} belongs to staff "${personDisplayName(profile.name, profile.email)}". ` +
  "Use Merge to combine this member with them so their attendance moves across.";

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

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, { name, email, metadata }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const trimmed = capitalizeMemberName(name.trim());
    if (!trimmed) throw new ConvexError("Name is required.");
    if (canonicalEmailKey(email) && (await findMemberByEmail(ctx, email))) {
      const staff = await staffProfileForEmail(ctx, email!, staffYearForDate(new Date()));
      if (staff) {
        throw new ConvexError(
          `${personDisplayName(staff.name, staff.email)} is staff and already in the members list.`
        );
      }
    }
    const memberId = await ctx.db.insert("attendanceMembers", {
      name: trimmed,
      email: email?.trim().toLowerCase() || undefined,
      metadata,
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
    metadata: v.optional(v.record(v.string(), v.string())),
    staffYear: v.optional(v.number()),
  },
  handler: async (ctx, { memberId, name, email, metadata, staffYear }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) throw new ConvexError("Member not found.");
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const newKey = canonicalEmailKey(email);
    if (
      newKey &&
      newKey !== canonicalEmailKey(row.email) &&
      !(await staffProfileForRow(ctx, row, profileYear))
    ) {
      const staff = await staffProfileForEmail(ctx, email!, profileYear);
      if (staff) throw new ConvexError(staffEmailMessage(staff));
    }
    const profile = await staffOverlayProfile(ctx, row, profileYear, email);
    if (profile) {
      const fields = await allMetadataFields(ctx);
      await ctx.db.patch(memberId, {
        name: profile.name ?? row.name,
        email: profile.email.toLowerCase(),
        metadata: staffLockedMetadata(fields, profile, metadata),
      });
      await logAttendanceAction(ctx, {
        actorEmail,
        entityType: "member",
        action: "member.update",
        summary: `Updated member "${profile.name ?? row.name}"`,
        memberId,
        subjectEmail: profile.email,
      });
      return;
    }
    if (await isStaffOverlayRow(ctx, row, profileYear, email)) {
      throw new ConvexError("Staff profile not found.");
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    await ctx.db.patch(memberId, {
      name: trimmed,
      email: email?.trim().toLowerCase() || undefined,
      metadata,
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

/** Deleting a member is permanent, so the audit entry has to carry enough to
 *  reconstruct what went with them. Beyond this many lines the entry would
 *  bloat the log without being readable; the count above it stays exact. */
const MAX_AUDIT_ATTENDANCE_LINES = 100;

const auditStamp = (ms: number): string => {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms));
  } catch {
    // Runtimes without full ICU still get something sortable and unambiguous.
    return new Date(ms).toISOString();
  }
};

export const remove = mutation({
  args: { memberId: v.id("attendanceMembers") },
  handler: async (ctx, { memberId }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) return;
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
      shadow: Doc<"attendanceMembers"> | null;
    };

type MergePair =
  | { blocked: string }
  | { remove: Doc<"attendanceMembers">; keep: MergeKeep };

/** Staff are recognised the same way as the overlay checks above: a profile in
 *  the year being viewed, this staff year, or next staff year. */
const staffYearsToCheck = (profileYear: number): number[] => {
  const now = staffYearForDate(new Date());
  return [...new Set([profileYear, now, now + 1])];
};

const staffProfileForRow = async (
  ctx: Ctx,
  row: Doc<"attendanceMembers">,
  profileYear: number
): Promise<Doc<"staffProfiles"> | null> => {
  for (const year of staffYearsToCheck(profileYear)) {
    const profile = await staffOverlayProfile(ctx, row, year);
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
  return null;
};

const resolveMergePair = async (
  ctx: Ctx,
  removeId: Id<"attendanceMembers">,
  keepArg: { memberId: Id<"attendanceMembers"> } | { staffEmail: string },
  profileYear: number
): Promise<MergePair> => {
  const remove = await ctx.db.get(removeId);
  if (!remove) return { blocked: "That member no longer exists." };
  if (await staffProfileForRow(ctx, remove, profileYear)) {
    return {
      blocked: `${remove.name} is staff. Staff can't be merged into someone else — merge the member into the staff person instead.`,
    };
  }

  let profile: Doc<"staffProfiles"> | null;
  let keepRow: Doc<"attendanceMembers"> | null = null;
  if ("memberId" in keepArg) {
    keepRow = await ctx.db.get(keepArg.memberId);
    if (!keepRow) return { blocked: "The person to keep no longer exists." };
    if (keepRow._id === remove._id) {
      return { blocked: "Pick two different people to merge." };
    }
    profile = await staffProfileForRow(ctx, keepRow, profileYear);
  } else {
    profile = await staffProfileForEmail(ctx, keepArg.staffEmail, profileYear);
    if (!profile) return { blocked: "Staff profile not found." };
  }

  if (!profile) return { remove, keep: { kind: "member", row: keepRow! } };
  const email = profile.email.toLowerCase();
  // `remove` can't be this overlay: carrying the staff email would have made
  // it staff, which is blocked above.
  const shadow = keepRow ?? (await findMemberByEmail(ctx, email));
  return { remove, keep: { kind: "staff", profile, email, shadow } };
};

const keepSide = async (
  ctx: Ctx,
  keep: MergeKeep,
  fields: MetadataField[]
): Promise<MergeSide> =>
  keep.kind === "member"
    ? {
        name: keep.row.name,
        email: keep.row.email,
        metadata: keep.row.metadata ?? {},
      }
    : {
        name: personDisplayName(keep.profile.name, keep.email),
        email: keep.email,
        metadata: staffLockedMetadata(fields, keep.profile, keep.shadow?.metadata),
      };

const removeSide = (row: Doc<"attendanceMembers">): MergeSide => ({
  name: row.name,
  email: row.email,
  metadata: row.metadata ?? {},
});

/** A staff person's name and email come from their profile, and their campus
 *  and role from their assignments, so those can't be overwritten by a merge. */
const lockedFor = (keep: MergeKeep, fields: MetadataField[]) =>
  keep.kind === "staff"
    ? {
        identityLocked: true,
        lockedFieldIds: fields
          .filter((f) => f.key === CAMPUS_FIELD_KEY || f.key === ROLE_FIELD_KEY)
          .map((f) => f._id as string),
      }
    : {};

/** The kept person's attendance row at `eventId`, if they already have one. */
const keptRecordAt = async (
  ctx: Ctx,
  keep: MergeKeep,
  eventId: Id<"events">
): Promise<Doc<"attendance"> | null> => {
  if (keep.kind === "staff") {
    const byEmail = await ctx.db
      .query("attendance")
      .withIndex("by_event_and_email", (q) =>
        q.eq("eventId", eventId).eq("email", keep.email)
      )
      .unique();
    if (byEmail || !keep.shadow) return byEmail;
  }
  const keepMemberId = keep.kind === "member" ? keep.row._id : keep.shadow!._id;
  return await ctx.db
    .query("attendance")
    .withIndex("by_event_and_member", (q) =>
      q.eq("eventId", eventId).eq("memberId", keepMemberId)
    )
    .unique();
};

/** How much each side was used: distinct events attended and the latest one,
 *  so the leader can see which record is the "real" one before merging. */
type History = { events: number; lastAttended: number | null };

const historyOf = (rows: Doc<"attendance">[]): History => {
  const events = new Set(rows.map((r) => r.eventId));
  const last = rows.reduce<number | null>(
    (max, r) => (max === null || r.signInTime > max ? r.signInTime : max),
    null
  );
  return { events: events.size, lastAttended: last };
};

const keptHistory = async (ctx: Ctx, keep: MergeKeep): Promise<History> => {
  const rows: Doc<"attendance">[] = [];
  if (keep.kind === "staff") {
    rows.push(
      ...(await ctx.db
        .query("attendance")
        .withIndex("by_email", (q) => q.eq("email", keep.email))
        .collect())
    );
  }
  const memberId = keep.kind === "member" ? keep.row._id : keep.shadow?._id;
  if (memberId) {
    rows.push(
      ...(await ctx.db
        .query("attendance")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .collect())
    );
  }
  return historyOf(rows);
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
    const kept = await keepSide(ctx, keep, fields);
    const removed = removeSide(remove);
    const conflicts: MergeConflict[] = detectMergeConflicts(
      kept,
      removed,
      fields,
      lockedFor(keep, fields)
    );
    const records = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", remove._id))
      .collect();
    let shared = 0;
    for (const record of records) {
      if (await keptRecordAt(ctx, keep, record.eventId)) shared++;
    }
    return {
      keep: { kind: keep.kind, ...kept, history: await keptHistory(ctx, keep) },
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
    const { remove } = pair;
    let keep = pair.keep;
    const fields = await allMetadataFields(ctx);
    const kept = await keepSide(ctx, keep, fields);
    const merged = buildMergedFields(
      kept,
      removeSide(remove),
      fields,
      resolutions,
      lockedFor(keep, fields)
    );

    let keptMemberId: Id<"attendanceMembers"> | undefined;
    if (keep.kind === "member") {
      await ctx.db.patch(keep.row._id, {
        name: merged.name,
        email: merged.email,
        metadata: merged.metadata,
      });
      keptMemberId = keep.row._id;
    } else {
      const metadata = staffLockedMetadata(fields, keep.profile, merged.metadata);
      const name = keep.profile.name ?? keep.shadow?.name ?? keep.email;
      if (keep.shadow) {
        await ctx.db.patch(keep.shadow._id, { name, email: keep.email, metadata });
        keptMemberId = keep.shadow._id;
      } else {
        // The staff person needs an overlay row even when the member had no
        // details to carry: in years before they were staff, their moved
        // attendance is named from this row, not from a staff profile.
        keptMemberId = await ctx.db.insert("attendanceMembers", {
          name,
          email: keep.email,
          metadata,
        });
        const shadow = await ctx.db.get(keptMemberId);
        keep = { ...keep, shadow };
      }
    }

    const records = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", remove._id))
      .collect();
    let moved = 0;
    let combined = 0;
    for (const record of records) {
      const existing = await keptRecordAt(ctx, keep, record.eventId);
      if (existing) {
        // Both were signed in to this event: keep one record, with the
        // earlier sign-in time and both sets of notes.
        await ctx.db.patch(existing._id, {
          signInTime: Math.min(existing.signInTime, record.signInTime),
          notes: mergeNotes(existing.notes, record.notes),
        });
        await ctx.db.delete(record._id);
        combined++;
      } else if (keep.kind === "staff") {
        // Staff attendance is keyed by email, like a staff sign-in.
        await ctx.db.patch(record._id, { email: keep.email, memberId: undefined });
        moved++;
      } else {
        await ctx.db.patch(record._id, { memberId: keep.row._id });
        moved++;
      }
    }

    await ctx.db.delete(remove._id);

    const keptName = keep.kind === "member" ? merged.name : kept.name;
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.merge",
      summary: `Merged "${remove.name}" into ${keep.kind === "staff" ? "staff " : ""}"${keptName}"`,
      memberId: keptMemberId,
      subjectEmail: keep.kind === "staff" ? keep.email : merged.email,
      detail: [
        `Moved ${moved} attendance record${moved === 1 ? "" : "s"}` +
          (combined
            ? `; combined ${combined} event${combined === 1 ? "" : "s"} both were signed in to`
            : ""),
        `Removed member "${remove.name}" (${remove._id})`,
      ].join("\n"),
    });
    return { moved, combined };
  },
});
