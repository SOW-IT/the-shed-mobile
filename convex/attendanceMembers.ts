import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  assignmentsOf,
  roleNeedsUniversity,
  rolesOfLike,
  staffYearForDate,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  formatMetadataFieldValue,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "../shared/attendanceMemberMeta";
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

const metadataFieldsForYear = async (
  ctx: Parameters<typeof getProfile>[0],
  year: number
): Promise<MetadataField[]> =>
  (
    await ctx.db
      .query("attendanceMetadata")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()
  ).sort((a, b) => a.order - b.order);

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
    const metadataFields = (
      await ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", args.year))
        .collect()
    ).sort((a, b) => a.order - b.order);
    const yearField = metadataFields.find((f) => f.key === STUDENT_YEAR_FIELD_KEY);

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .collect();
    const extra = await ctx.db
      .query("attendanceMembers")
      .collect();

    const shadowByEmail = new Map(
      extra
        .filter((m) => m.staffEmail)
        .map((m) => [m.staffEmail!.toLowerCase(), m])
    );
    const pureExtras = extra.filter((m) => !m.staffEmail);

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
        args.year,
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
        subtitle: metadataLabel(metadataFields, m.metadata, args.year, ["Campus"]),
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
                args.year,
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
          args.year,
          yearField.values
        );
        bv = yearMetadataSortKey(
          b.metadata[sortKey] ?? "",
          args.year,
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

/** Load a single attendance member row for editing. */
export const get = query({
  args: { memberId: v.id("attendanceMembers") },
  handler: async (ctx, { memberId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const row = await ctx.db.get(memberId);
    if (!row?.staffEmail) return row;
    const currentYear = staffYearForDate(new Date());
    const profile = await getProfile(ctx, row.staffEmail, currentYear);
    if (!profile) return row;
    const fields = await metadataFieldsForYear(ctx, currentYear);
    return {
      ...row,
      name: profile.name ?? row.name,
      email: profile.email,
      metadata: staffLockedMetadata(fields, profile, row.metadata),
    };
  },
});

/** Ensure a metadata overlay exists for a staff profile. */
export const ensureForStaff = mutation({
  args: { staffEmail: v.string() },
  handler: async (ctx, { staffEmail }) => {
    await requireProfile(ctx);
    const email = staffEmail.trim().toLowerCase();
    if (!email) throw new ConvexError("Staff email is required.");
    const existing = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_staff_email", (q) => q.eq("staffEmail", email))
      .unique();
    if (existing) return existing._id;
    const currentYear = staffYearForDate(new Date());
    const profile = await getProfile(ctx, email, currentYear);
    if (!profile) throw new ConvexError("Staff profile not found.");
    const fields = await metadataFieldsForYear(ctx, currentYear);
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
  },
  handler: async (ctx, { memberId, name, email, metadata }) => {
    await requireProfile(ctx);
    const row = await ctx.db.get(memberId);
    if (!row) throw new ConvexError("Member not found.");
    if (row.staffEmail) {
      const currentYear = staffYearForDate(new Date());
      const profile = await getProfile(ctx, row.staffEmail, currentYear);
      if (!profile) throw new ConvexError("Staff profile not found.");
      const fields = await metadataFieldsForYear(ctx, currentYear);
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
