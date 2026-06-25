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
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "../shared/attendanceMemberMeta";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { mutation, query } from "./_generated/server";
import { getProfile, optionalProfile, requireProfile } from "./model";

export type MemberRow = {
  key: string;
  kind: "staff" | "member";
  name: string;
  email?: string;
  memberId?: string;
  subtitle?: string;
  university?: string;
  metadata: Record<string, string>;
  photo?: string | null;
};

type MetadataField = {
  _id: string;
  key: string;
  values?: Record<string, string>;
};

const allMetadataFields = async (
  ctx: Parameters<typeof getProfile>[0]
): Promise<MetadataField[]> =>
  (await ctx.db.query("attendanceMetadata").collect()).sort(
    (a, b) => a.order - b.order
  );

const optionIdForLabel = (field: MetadataField, label: string): string => {
  for (const [id, value] of Object.entries(field.values ?? {})) {
    if (value === label) return id;
  }
  return label;
};

const staffLockedMetadata = (
  fields: MetadataField[],
  profile: Parameters<typeof assignmentsOf>[0],
  metadata: Record<string, string> | undefined
): Record<string, string> => {
  const next = { ...(metadata ?? {}) };
  const campusField = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
  const assignments = assignmentsOf(profile);
  const campus = [
    ...new Set(assignments.flatMap((a) => (a.university ? [a.university] : []))),
  ][0];
  const role = rolesOfLike(profile)[0];

  if (campusField) {
    if (campus) next[campusField._id] = optionIdForLabel(campusField, campus);
    else delete next[campusField._id];
  }
  if (roleField) {
    if (role) next[roleField._id] = optionIdForLabel(roleField, role);
    else delete next[roleField._id];
  }
  return next;
};

const metadataLabel = (
  fields: MetadataField[],
  metadata: Record<string, string> | undefined,
  viewingStaffYear: number,
  excludeKeys: string[] = []
): string => {
  if (!metadata) return "";
  const excluded = new Set(excludeKeys);
  return fields
    .filter((f) => !excluded.has(f.key))
    .map((f) => {
      const raw = metadata[f._id];
      if (!raw) return null;
      return formatMetadataFieldValue(
        f.key,
        raw,
        viewingStaffYear,
        f.values
      );
    })
    .filter(Boolean)
    .join(" · ");
};

const resolveUniversity = (
  fields: MetadataField[],
  metadata: Record<string, string> | undefined,
  orgCampuses: string[] = []
): string | undefined => {
  const campusField = fields.find((f) => f.key === "Campus");
  if (campusField && metadata) {
    const raw = metadata[campusField._id];
    if (raw) {
      const label = campusField.values?.[raw] ?? raw;
      if (label && label !== "Other") return label;
    }
  }
  return orgCampuses[0];
};

const staffSubtitle = (roles: string[]): string | undefined =>
  roles.length > 0 ? roles.join(" · ") : undefined;

/** Combined staff profiles + attendance-only members, with search/filter/sort. */
export const list = query({
  args: {
    year: v.number(),
    search: v.optional(v.string()),
    sortKey: v.optional(v.string()),
    sortAsc: v.optional(v.boolean()),
    filters: v.optional(v.record(v.string(), v.string())),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await optionalProfile(ctx))) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    // Metadata fields are global; the student "Year" level is shown relative to
    // the current calendar year. Staff profiles are still per staff year.
    const viewingYear = sydneyCalendarYear(new Date());
    const metadataFields = await allMetadataFields(ctx);
    const yearField = metadataFields.find((f) => f.key === STUDENT_YEAR_FIELD_KEY);

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .collect();
    const extra = await ctx.db
      .query("attendanceMembers")
      .collect();

    // Link attendance-member rows to this year's staff profiles so a person is
    // shown once. An overlay matches a profile either by its explicit
    // `staffEmail` or by its plain `email` (e.g. someone added as an
    // attendance-only member *before* being provisioned as staff, who has no
    // `staffEmail` link). Matching against THIS year's profiles means a year in
    // which the person wasn't yet staff still lists them as a plain member —
    // they appear as whatever they were that year, not retroactively as staff.
    const profileEmails = new Set(profiles.map((p) => p.email.toLowerCase()));
    const matchProfileEmail = (email: string | undefined): string | undefined =>
      staffEmailCandidates(email).find((c) => profileEmails.has(c));
    const shadowByEmail = new Map<string, (typeof extra)[number]>();
    const pureExtras: typeof extra = [];
    for (const m of extra) {
      const matched = matchProfileEmail(m.staffEmail) ?? matchProfileEmail(m.email);
      if (matched) {
        if (!shadowByEmail.has(matched)) shadowByEmail.set(matched, m);
        continue;
      }
      // A staffEmail that matches no profile this year stays hidden (not a pure
      // extra), preserving prior behaviour for stale overlays.
      if (m.staffEmail) {
        const key = m.staffEmail.toLowerCase();
        if (!shadowByEmail.has(key)) shadowByEmail.set(key, m);
        continue;
      }
      pureExtras.push(m);
    }

    const rows: MemberRow[] = [];

    for (const p of profiles) {
      const shadow = shadowByEmail.get(p.email.toLowerCase());
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
      const metaSubtitle = metadataLabel(
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
        name: p.name ?? p.email,
        email: p.email,
        memberId: shadow?._id,
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
        subtitle: metadataLabel(metadataFields, m.metadata, viewingYear, ["Campus"]),
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

    if (args.filters) {
      for (const [fieldId, value] of Object.entries(args.filters)) {
        if (!value || value === "all") continue;
        if (value === "unset") {
          filtered = filtered.filter((r) => !r.metadata[fieldId]);
        } else if (
          yearField &&
          fieldId === yearField._id &&
          yearField.values
        ) {
          filtered = filtered.filter((r) => {
            const stored = r.metadata[fieldId];
            if (!stored) return false;
            return (
              yearOptionIdForStoredValue(
                stored,
                viewingYear,
                yearField.values!
              ) === value
            );
          });
        } else {
          filtered = filtered.filter((r) => r.metadata[fieldId] === value);
        }
      }
    }

    const asc = args.sortAsc ?? true;
    const sortKey = args.sortKey ?? "name";
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
        av = a.metadata[sortKey] ?? "";
        bv = b.metadata[sortKey] ?? "";
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

/**
 * Load a single attendance member row for editing. For a staff overlay the
 * name/email and locked Campus/Role come from the profile of `staffYear` (the
 * event's staff year when editing from a roll-call), so it stays aligned with
 * how the roster resolves that same person; defaults to the current staff year.
 */
export const get = query({
  args: {
    memberId: v.id("attendanceMembers"),
    staffYear: v.optional(v.number()),
  },
  handler: async (ctx, { memberId, staffYear }) => {
    if (!(await optionalProfile(ctx))) return null;
    const row = await ctx.db.get(memberId);
    if (!row?.staffEmail) return row;
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const profile = await getProfile(ctx, row.staffEmail, profileYear);
    if (!profile) return row;
    const fields = await allMetadataFields(ctx);
    return {
      ...row,
      name: profile.name ?? row.name,
      email: profile.email,
      metadata: staffLockedMetadata(fields, profile, row.metadata),
    };
  },
});

/**
 * Members whose name matches `name` (case-insensitively, trimmed), with their
 * metadata. Powers the "a member with this name already exists" warning and the
 * confirm-before-create prompt in the new-member form, so an admin can see who
 * they might be duplicating before adding another person with the same name.
 */
export const byName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    if (!(await optionalProfile(ctx))) return [];
    const normalized = name.trim().toLowerCase();
    if (!normalized) return [];
    const members = await ctx.db.query("attendanceMembers").collect();
    return members
      .filter((m) => m.name.trim().toLowerCase() === normalized)
      .map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email,
        staffEmail: m.staffEmail,
        metadata: m.metadata ?? {},
      }));
  },
});

/** Ensure a metadata overlay exists for a staff profile. */
export const ensureForStaff = mutation({
  args: { staffEmail: v.string(), staffYear: v.optional(v.number()) },
  handler: async (ctx, { staffEmail, staffYear }) => {
    await requireProfile(ctx);
    const email = staffEmail.trim().toLowerCase();
    if (!email) throw new ConvexError("Staff email is required.");
    const existing = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_staff_email", (q) => q.eq("staffEmail", email))
      .unique();
    if (existing) return existing._id;
    // Verify this email really is a staff profile for `staffYear` (the event's
    // staff year when editing from a roll-call; defaults to the current one)
    // BEFORE adopting/creating an overlay — a mistyped or stale email must not
    // convert a plain member into a staff overlay (hiding it from `list`).
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const profile = await getProfile(ctx, email, profileYear);
    if (!profile) throw new ConvexError("Staff profile not found.");
    // Adopt an unlinked attendance-only row whose plain email matches this
    // staff member (e.g. they were added as a member before being provisioned
    // as staff) — link it instead of inserting a duplicate.
    const candidates = staffEmailCandidates(email);
    const unlinked = (await ctx.db.query("attendanceMembers").collect()).find(
      (m) => !m.staffEmail && m.email && candidates.includes(m.email.toLowerCase())
    );
    if (unlinked) {
      await ctx.db.patch(unlinked._id, { staffEmail: email });
      return unlinked._id;
    }
    const fields = await allMetadataFields(ctx);
    return await ctx.db.insert("attendanceMembers", {
      name: profile.name ?? email,
      email,
      staffEmail: email,
      metadata: staffLockedMetadata(fields, profile, {}),
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, { name, email, metadata }) => {
    await requireProfile(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    return await ctx.db.insert("attendanceMembers", {
      name: trimmed,
      email: email?.trim() || undefined,
      metadata,
    });
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
    await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) throw new ConvexError("Member not found.");
    if (row.staffEmail) {
      const profileYear = staffYear ?? staffYearForDate(new Date());
      const profile = await getProfile(ctx, row.staffEmail, profileYear);
      if (!profile) throw new ConvexError("Staff profile not found.");
      const fields = await allMetadataFields(ctx);
      await ctx.db.patch(memberId, {
        name: profile.name ?? row.name,
        email: profile.email,
        metadata: staffLockedMetadata(fields, profile, metadata),
      });
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    await ctx.db.patch(memberId, {
      name: trimmed,
      email: email?.trim() || undefined,
      metadata,
    });
  },
});

export const remove = mutation({
  args: { memberId: v.id("attendanceMembers") },
  handler: async (ctx, { memberId }) => {
    await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) return;
    const signed = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", memberId))
      .collect();
    for (const s of signed) await ctx.db.delete(s._id);
    await ctx.db.delete(memberId);
  },
});
