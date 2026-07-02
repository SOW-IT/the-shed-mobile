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
  roleFilterMatches,
  STUDENT_YEAR_FIELD_KEY,
  yearMetadataSortKey,
  yearOptionIdForStoredValue,
} from "../shared/attendanceMemberMeta";
import { personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { mutation, query } from "./_generated/server";
import {
  findMemberByEmail,
  getProfile,
  optionalProfile,
  requireProfile,
} from "./model";
import { logAttendanceAction } from "./attendanceAudit";
import { Doc } from "./_generated/dataModel";

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
  viewingYear: number,
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
        viewingYear,
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

const staffOverlayProfile = async (
  ctx: Parameters<typeof getProfile>[0],
  row: Doc<"attendanceMembers">,
  profileYear: number,
  emailOverride?: string
): Promise<Doc<"staffProfiles"> | null> => {
  const emails = [row.staffEmail, row.email, emailOverride].filter(
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

/**
 * Whether a member row represents a staff person at all — i.e. its email maps to
 * a staff profile in the event's staff year OR the current/next one (tolerating
 * the Oct rollover). Used to protect a staff overlay from being edited as a plain
 * member when no profile is found for the exact requested year. This is the
 * derived replacement for the old stored `staffEmail` flag.
 */
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

/** Combined staff profiles + attendance-only members, with search/filter/sort. */
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
    // Metadata fields are global; the student "Year" level is shown relative to
    // the current calendar year. Staff profiles are still per staff year.
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

    // Link attendance-member rows to this year's staff profiles so a person is
    // shown ONCE. An overlay matches a profile either by its explicit
    // `staffEmail` or by its plain `email` (e.g. someone added as an
    // attendance-only member *before* being provisioned as staff, who has no
    // `staffEmail` link). Matching against THIS year's profiles means a year in
    // which the person wasn't yet staff still lists them as a plain member —
    // they appear as whatever they were that year, not retroactively as staff.
    //
    // BOTH sides are reduced to one canonical key (shared `canonicalEmailKey`)
    // so the link can't slip on a formatting difference: it trims, lowercases,
    // and collapses the two SOW staff-domain spellings (…@sow.org.au /
    // …@sowaustralia.com) to a single value. A profile and member that differ
    // only by domain, case, or stray whitespace therefore resolve to the same
    // person instead of appearing as a duplicate (a staff row + a pure extra).
    const profileKeys = new Set(
      profiles.flatMap((p) => {
        const key = canonicalEmailKey(p.email);
        return key ? [key] : [];
      })
    );
    const memberProfileKey = (m: (typeof extra)[number]): string | undefined => {
      for (const email of [m.staffEmail, m.email]) {
        const key = canonicalEmailKey(email);
        if (key && profileKeys.has(key)) return key;
      }
      return undefined;
    };
    const shadowByKey = new Map<string, (typeof extra)[number]>();
    const pureExtras: typeof extra = [];
    for (const m of extra) {
      const key = memberProfileKey(m);
      if (key) {
        // First overlay wins; any further attendance rows that resolve to the
        // same profile fold into that one member (never a second row).
        if (!shadowByKey.has(key)) shadowByKey.set(key, m);
        continue;
      }
      // A staffEmail that matches no profile this year stays hidden (not a pure
      // extra), preserving prior behaviour for stale overlays. It has no profile
      // row to attach to, so it simply isn't listed.
      if (m.staffEmail) continue;
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
        // Staff-ness follows the CURRENT staff year: a profile that carries no
        // assignment (no role this year) is listed as a Member from this year
        // on, even if they held a role in a previous year. Still editable via
        // their email (the row keeps it) so their member metadata stays reachable.
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

    const matchesFieldFilter = (
      row: MemberRow,
      fieldId: string,
      value: string
    ): boolean => {
      if (value === "unset") return !row.metadata[fieldId];
      if (yearField && fieldId === yearField._id && yearField.values) {
        const stored = row.metadata[fieldId];
        if (!stored) return false;
        return (
          yearOptionIdForStoredValue(stored, viewingYear, yearField.values) ===
          value
        );
      }
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
    if (!row) return null;
    const profileYear = staffYear ?? staffYearForDate(new Date());
    const profile = await staffOverlayProfile(ctx, row, profileYear);
    // `isStaffOverlay` tells the edit sheet to keep profile-locked fields
    // (name / Campus / Role) read-only. It's derived from whether the row's
    // email resolves to a staff profile this year — no stored flag.
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
        metadata: m.metadata ?? {},
      }));
  },
});

/** Ensure a metadata overlay exists for a staff profile. */
export const ensureForStaff = mutation({
  args: { staffEmail: v.string(), staffYear: v.optional(v.number()) },
  handler: async (ctx, { staffEmail, staffYear }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    if (!canonicalEmailKey(staffEmail)) {
      throw new ConvexError("Staff email is required.");
    }
    // Verify this email really is a staff profile for `staffYear` (the event's
    // staff year when editing from a roll-call; defaults to the current one)
    // BEFORE vouching for an overlay — a mistyped/stale email, or a plain member
    // with no staff profile, must not be treated as staff.
    const profileYear = staffYear ?? staffYearForDate(new Date());
    let profile: Awaited<ReturnType<typeof getProfile>> = null;
    for (const candidate of staffEmailCandidates(staffEmail)) {
      profile = await getProfile(ctx, candidate, profileYear);
      if (profile) break;
    }
    if (!profile) throw new ConvexError("Staff profile not found.");
    const linkEmail = profile.email.toLowerCase();
    // A member links to its staff profile by `email` alone, so any existing row
    // for the profile's address (either SOW-domain spelling; a plain member
    // added before provisioning included) is already the overlay — reuse it.
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

export const create = mutation({
  args: {
    name: v.string(),
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, { name, email, metadata }) => {
    const { email: actorEmail } = await requireProfile(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    const memberId = await ctx.db.insert("attendanceMembers", {
      name: trimmed,
      // Normalise (trim + lowercase) so the by_email link is stable — the
      // indexed lookup in findMemberByEmail is exact, so a stored "A@X" must not
      // differ from a looked-up "a@x".
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
    // A staff overlay with no profile for the requested year must not be edited
    // as a plain member (which would wipe its locked fields) — refuse instead.
    if (await isStaffOverlayRow(ctx, row, profileYear, email)) {
      throw new ConvexError("Staff profile not found.");
    }
    const trimmed = name.trim();
    if (!trimmed) throw new ConvexError("Name is required.");
    await ctx.db.patch(memberId, {
      name: trimmed,
      // Normalised so the by_email link stays exact-match — see create().
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
    for (const s of signed) await ctx.db.delete(s._id);
    await ctx.db.delete(memberId);
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.delete",
      summary: `Deleted member "${row.name}"`,
      subjectEmail: row.email ?? row.staffEmail,
      detail:
        signed.length > 0 ? `Removed ${signed.length} attendance record(s)` : undefined,
    });
  },
});
