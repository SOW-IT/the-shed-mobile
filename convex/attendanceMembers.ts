import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  assignmentsOf,
  roleNeedsUniversity,
  rolesOfLike,
} from "../shared/flow";
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

const metadataLabel = (
  fields: MetadataField[],
  metadata: Record<string, string> | undefined,
  excludeKeys: string[] = []
): string => {
  if (!metadata) return "";
  const excluded = new Set(excludeKeys);
  return fields
    .filter((f) => !excluded.has(f.key))
    .map((f) => {
      const raw = metadata[f._id];
      if (!raw) return null;
      if (f.values?.[raw]) return f.values[raw];
      return raw;
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
    const metadataFields = await ctx.db
      .query("attendanceMetadata")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .collect();

    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .collect();
    const extra = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_year", (q) => q.eq("year", args.year))
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
      const metaSubtitle = metadataLabel(metadataFields, shadow?.metadata, ["Campus"]);
      const subtitle = [orgSubtitle, metaSubtitle].filter(Boolean).join(" · ");
      const university = resolveUniversity(
        metadataFields,
        shadow?.metadata,
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
        metadata: shadow?.metadata ?? {},
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
        subtitle: metadataLabel(metadataFields, m.metadata, ["Campus"]),
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
    return await ctx.db.get(memberId);
  },
});

/** Ensure a metadata overlay exists for a staff profile in this year. */
export const ensureForStaff = mutation({
  args: { year: v.number(), staffEmail: v.string() },
  handler: async (ctx, { year, staffEmail }) => {
    await requireProfile(ctx);
    const email = staffEmail.trim().toLowerCase();
    if (!email) throw new ConvexError("Staff email is required.");
    const existing = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_year_and_staff_email", (q) =>
        q.eq("year", year).eq("staffEmail", email)
      )
      .unique();
    if (existing) return existing._id;
    const profile = await getProfile(ctx, email, year);
    if (!profile) throw new ConvexError("Staff profile not found.");
    return await ctx.db.insert("attendanceMembers", {
      year,
      name: profile.name ?? email,
      email,
      staffEmail: email,
      metadata: {},
    });
  },
});

export const create = mutation({
  args: {
    year: v.number(),
    name: v.string(),
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, { year, name, email, metadata }) => {
    await requireProfile(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    return await ctx.db.insert("attendanceMembers", {
      year,
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
      await ctx.db.patch(memberId, { metadata });
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
