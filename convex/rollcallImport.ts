import { v } from "convex/values";
import { assignmentsOf, rolesOfLike, staffYearForDate } from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  canonicalizeGenderOptionId,
  canonicalizeGenderValues,
  GENDER_FIELD_KEY,
  GENDER_OPTION_IDS,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  STUDENT_YEAR_VALUES,
  commencementStaffYearFromLevel,
} from "../shared/attendanceMemberMeta";
import { canonicalSubgroup, normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import {
  canonicalImportMemberName,
  canonicalStaffEmailFromLegacy,
  staffEmailCandidates,
} from "../shared/rollcallImport";
import { Id } from "./_generated/dataModel";
import { MutationCtx, mutation } from "./_generated/server";
import { getProfile, requireAdmin } from "./model";

const metadataField = v.object({
  key: v.string(),
  type: v.union(v.literal("select"), v.literal("input")),
  order: v.number(),
  values: v.optional(v.record(v.string(), v.string())),
  subgroup: v.optional(v.string()),
  sourceIds: v.optional(v.array(v.string())),
});

const tagInput = v.object({
  name: v.string(),
  colour: v.optional(v.string()),
  subgroups: v.optional(v.array(v.string())),
  sourceIds: v.optional(v.array(v.string())),
});

const memberInput = v.object({
  sourceImportId: v.string(),
  name: v.string(),
  email: v.optional(v.string()),
  subgroup: v.string(),
  metadata: v.optional(v.record(v.string(), v.string())),
});

const eventInput = v.object({
  sourceImportId: v.string(),
  name: v.string(),
  dateStart: v.number(),
  dateEnd: v.number(),
  subgroup: v.string(),
  collaboration: v.array(v.string()),
  tagIds: v.array(v.string()),
  members: v.array(
    v.object({
      memberId: v.optional(v.string()),
      signInTime: v.optional(v.number()),
      notes: v.optional(v.string()),
    })
  ),
});

const optionIdForLabel = (
  values: Record<string, string> | undefined,
  label: string
): string => {
  for (const [id, value] of Object.entries(values ?? {})) {
    if (value === label) return id;
  }
  return label;
};

async function fieldsForYear(ctx: MutationCtx, year: number) {
  return await ctx.db
    .query("attendanceMetadata")
    .withIndex("by_year", (q) => q.eq("year", year))
    .take(100);
}

const normalizedEmail = (email: string | undefined): string | undefined => {
  const lower = email?.trim().toLowerCase();
  return lower && lower.includes("@") ? lower : undefined;
};

const staffLockedMetadata = (
  fields: Awaited<ReturnType<typeof fieldsForYear>>,
  profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>,
  metadata: Record<string, string> | undefined
): Record<string, string> => {
  const next = { ...(metadata ?? {}) };
  const campusField = fields.find((field) => field.key === CAMPUS_FIELD_KEY);
  const roleField = fields.find((field) => field.key === ROLE_FIELD_KEY);
  const campus = [
    ...new Set(
      assignmentsOf(profile).flatMap((assignment) =>
        assignment.university ? [assignment.university] : []
      )
    ),
  ][0];
  const role = rolesOfLike(profile)[0];

  if (campusField) {
    if (campus) next[campusField._id] = optionIdForLabel(campusField.values, campus);
    else delete next[campusField._id];
  }
  if (roleField) {
    if (role) next[roleField._id] = optionIdForLabel(roleField.values, role);
    else delete next[roleField._id];
  }
  return next;
};

const canonicalStaffEmailForLegacyMember = canonicalStaffEmailFromLegacy;

const mergeNotes = (
  existing: string | undefined,
  incoming: string | undefined
): string | undefined => {
  const existingTrimmed = existing?.trim();
  const incomingTrimmed = incoming?.trim();
  if (!existingTrimmed) return incomingTrimmed || undefined;
  if (!incomingTrimmed || existingTrimmed.includes(incomingTrimmed)) {
    return existingTrimmed;
  }
  return `${existingTrimmed}\n${incomingTrimmed}`;
};

async function metadataForMember(
  ctx: MutationCtx,
  year: number,
  raw: Record<string, string> | undefined,
  fieldMap: Record<string, Id<"attendanceMetadata">>,
  fieldsByKey: Map<string, Awaited<ReturnType<typeof fieldsForYear>>[number]>,
  staffEmail?: string
) {
  const out: Record<string, string> = {};
  const fieldRows = await fieldsForYear(ctx, year);
  const byId = new Map(fieldRows.map((field) => [field._id, field]));
  for (const [oldFieldId, value] of Object.entries(raw ?? {})) {
    const fieldId = fieldMap[oldFieldId];
    const field = fieldId ? byId.get(fieldId) : null;
    if (!field || !value) continue;
    if (field.key === STUDENT_YEAR_FIELD_KEY) {
      const label = field.values?.[value] ?? value;
      const commencement = commencementStaffYearFromLevel(label, year);
      if (commencement !== null) out[field._id] = String(commencement);
      continue;
    }
    if (field.key === GENDER_FIELD_KEY) {
      out[field._id] = canonicalizeGenderOptionId(value, field.values);
      continue;
    }
    out[field._id] = value;
  }

  if (staffEmail) {
    const profile = await getProfile(ctx, staffEmail, year);
    if (profile) {
      const campusField = fieldsByKey.get(CAMPUS_FIELD_KEY);
      const roleField = fieldsByKey.get(ROLE_FIELD_KEY);
      const campus = [
        ...new Set(
          assignmentsOf(profile).flatMap((a) => (a.university ? [a.university] : []))
        ),
      ][0];
      const role = rolesOfLike(profile)[0];
      if (campusField) {
        if (campus) out[campusField._id] = optionIdForLabel(campusField.values, campus);
        else delete out[campusField._id];
      }
      if (roleField) {
        if (role) out[roleField._id] = optionIdForLabel(roleField.values, role);
        else delete out[roleField._id];
      }
    }
  }
  return out;
}

export const prepare = mutation({
  args: {
    year: v.number(),
    metadata: v.array(metadataField),
    tags: v.array(tagInput),
  },
  returns: v.object({
    fieldMap: v.record(v.string(), v.id("attendanceMetadata")),
    tagMap: v.record(v.string(), v.id("attendanceTags")),
  }),
  handler: async (ctx, { year, metadata, tags }) => {
    await requireAdmin(ctx);
    const existingFields = await fieldsForYear(ctx, year);
    const fieldMap: Record<string, Id<"attendanceMetadata">> = {};

    for (const field of metadata) {
      const key = field.key.trim();
      if (!key) continue;
      const existing = existingFields.find(
        (row) => row.key.toLowerCase() === key.toLowerCase()
      );
      const values =
        field.type === "select"
          ? key === STUDENT_YEAR_FIELD_KEY
            ? STUDENT_YEAR_VALUES
            : key === GENDER_FIELD_KEY
              ? canonicalizeGenderValues(field.values)
              : (field.values ?? {})
          : undefined;
      const patch = {
        key,
        type: field.type,
        order: field.order,
        values,
        subgroup: field.subgroup ? canonicalSubgroup(field.subgroup) : undefined,
        ...(key === GENDER_FIELD_KEY
          ? { lockedValues: [...GENDER_OPTION_IDS, "Male", "Female"] }
          : {}),
      };
      const id =
        existing?._id ??
        (await ctx.db.insert("attendanceMetadata", {
          year,
          ...patch,
        }));
      if (existing) await ctx.db.patch(existing._id, patch);
      for (const oldId of field.sourceIds ?? []) fieldMap[oldId] = id;
    }

    const fieldsAfter = await fieldsForYear(ctx, year);
    for (const field of metadata) {
      const row = fieldsAfter.find(
        (candidate) => candidate.key.toLowerCase() === field.key.toLowerCase()
      );
      if (!row) continue;
      fieldMap[field.key] = row._id;
      for (const sourceId of field.sourceIds ?? []) fieldMap[sourceId] = row._id;
    }

    const tagMap: Record<string, Id<"attendanceTags">> = {};
    for (const tag of tags) {
      const name = tag.name.trim();
      if (!name) continue;
      const existing = await ctx.db
        .query("attendanceTags")
        .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", name))
        .unique();
      const id =
        existing?._id ??
        (await ctx.db.insert("attendanceTags", {
          year,
          name,
          colour: tag.colour,
          subgroups: tag.subgroups?.length
            ? normalizeSubgroups(tag.subgroups)
            : undefined,
        }));
      if (existing) {
        await ctx.db.patch(existing._id, {
          colour: tag.colour,
          subgroups: tag.subgroups?.length
            ? normalizeSubgroups(tag.subgroups)
            : undefined,
        });
      }
      tagMap[name.toLowerCase()] = id;
      for (const sourceId of tag.sourceIds ?? []) tagMap[sourceId] = id;
    }

    return { fieldMap, tagMap };
  },
});

export const importMembers = mutation({
  args: {
    year: v.number(),
    fieldMap: v.record(v.string(), v.id("attendanceMetadata")),
    members: v.array(memberInput),
  },
  returns: v.object({ imported: v.number(), staffOverlays: v.number() }),
  handler: async (ctx, { year, fieldMap, members }) => {
    await requireAdmin(ctx);
    const fields = await fieldsForYear(ctx, year);
    const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
    let imported = 0;
    let staffOverlays = 0;
    for (const member of members) {
      const displayName = canonicalImportMemberName(member.name);
      const directEmail = normalizedEmail(member.email);
      const legacyStaffEmail = canonicalStaffEmailForLegacyMember({
        name: member.name,
        email: member.email,
      });
      let profile = legacyStaffEmail
        ? await getProfile(ctx, legacyStaffEmail, year)
        : null;
      if (!profile && directEmail) {
        profile = await getProfile(ctx, directEmail, year);
      }
      const staffEmail = profile?.email ?? legacyStaffEmail ?? directEmail;
      const metadata = await metadataForMember(
        ctx,
        year,
        member.metadata,
        fieldMap,
        fieldsByKey,
        profile?.email
      );
      if (profile) {
        staffOverlays++;
        const existing = await ctx.db
          .query("attendanceMembers")
          .withIndex("by_year_and_staff_email", (q) =>
            q.eq("year", year).eq("staffEmail", profile.email)
          )
          .unique();
        const patch = {
          name: profile.name ?? displayName,
          email: profile.email,
          staffEmail: profile.email,
          sourceImportId: member.sourceImportId,
          metadata,
        };
        if (existing) await ctx.db.patch(existing._id, patch);
        else await ctx.db.insert("attendanceMembers", { year, ...patch });
        imported++;
        continue;
      }

      const existing = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_year_and_sourceImportId", (q) =>
          q.eq("year", year).eq("sourceImportId", member.sourceImportId)
        )
        .unique();
      const patch = {
        name: displayName,
        email: staffEmail,
        sourceImportId: member.sourceImportId,
        metadata,
      };
      if (!patch.name) continue;
      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert("attendanceMembers", { year, ...patch });
      imported++;
    }
    return { imported, staffOverlays };
  },
});

export const importEvents = mutation({
  args: {
    year: v.number(),
    tagMap: v.record(v.string(), v.id("attendanceTags")),
    memberAliasMap: v.optional(v.record(v.string(), v.string())),
    events: v.array(eventInput),
  },
  returns: v.object({ importedEvents: v.number(), importedAttendance: v.number() }),
  handler: async (ctx, { year, tagMap, memberAliasMap, events }) => {
    await requireAdmin(ctx);
    let importedEvents = 0;
    let importedAttendance = 0;
    for (const event of events) {
      const subgroups = normalizeSubgroups([
        event.subgroup,
        ...event.collaboration,
      ].filter(Boolean));
      const tagIds = event.tagIds.flatMap((sourceId) => {
        const tagId = tagMap[sourceId];
        return tagId ? [tagId] : [];
      });
      const existing = await ctx.db
        .query("events")
        .withIndex("by_year_and_sourceImportId", (q) =>
          q.eq("year", year).eq("sourceImportId", event.sourceImportId)
        )
        .unique();
      const patch = {
        year,
        name: event.name.trim() || "Untitled event",
        dateStart: event.dateStart,
        dateEnd: event.dateEnd,
        sourceImportId: event.sourceImportId,
        subgroups,
        tagIds: tagIds.length ? tagIds : undefined,
      };
      const eventId = existing?._id ?? (await ctx.db.insert("events", patch));
      if (existing) await ctx.db.patch(existing._id, patch);
      importedEvents++;

      for (const row of event.members) {
        if (!row.memberId) continue;
        const memberSourceId = memberAliasMap?.[row.memberId] ?? row.memberId;
        const member = await ctx.db
          .query("attendanceMembers")
          .withIndex("by_year_and_sourceImportId", (q) =>
            q.eq("year", year).eq("sourceImportId", memberSourceId)
          )
          .unique();
        if (!member) continue;
        const signInTime = row.signInTime ?? event.dateStart;
        if (member.staffEmail) {
          const existingAttendance = await ctx.db
            .query("attendance")
            .withIndex("by_event_and_email", (q) =>
              q.eq("eventId", eventId).eq("email", member.staffEmail)
            )
            .unique();
          const attendancePatch = {
            eventId,
            email: member.staffEmail,
            year,
            signInTime,
            notes: row.notes?.trim() || undefined,
          };
          if (existingAttendance) {
            await ctx.db.patch(existingAttendance._id, attendancePatch);
          } else {
            await ctx.db.insert("attendance", attendancePatch);
          }
        } else {
          const existingAttendance = await ctx.db
            .query("attendance")
            .withIndex("by_event_and_member", (q) =>
              q.eq("eventId", eventId).eq("memberId", member._id)
            )
            .unique();
          const attendancePatch = {
            eventId,
            memberId: member._id,
            year,
            signInTime,
            notes: row.notes?.trim() || undefined,
          };
          if (existingAttendance) {
            await ctx.db.patch(existingAttendance._id, attendancePatch);
          } else {
            await ctx.db.insert("attendance", attendancePatch);
          }
        }
        importedAttendance++;
      }
    }
    return { importedEvents, importedAttendance };
  },
});

export const summary = mutation({
  args: { year: v.number() },
  returns: v.object({
    metadata: v.number(),
    tags: v.number(),
    members: v.number(),
    events: v.number(),
    attendance: v.number(),
  }),
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    return {
      metadata: (
        await ctx.db
          .query("attendanceMetadata")
          .withIndex("by_year", (q) => q.eq("year", year))
          .take(1000)
      ).length,
      tags: (
        await ctx.db
          .query("attendanceTags")
          .withIndex("by_year", (q) => q.eq("year", year))
          .take(1000)
      ).length,
      members: (
        await ctx.db
          .query("attendanceMembers")
          .withIndex("by_year", (q) => q.eq("year", year))
          .take(5000)
      ).length,
      events: (
        await ctx.db
          .query("events")
          .withIndex("by_year", (q) => q.eq("year", year))
          .take(1000)
      ).length,
      attendance: (await ctx.db.query("attendance").take(10000)).filter(
        (row) => row.year === year
      ).length,
    };
  },
});

/**
 * Wipe every roll-call row for the given staff year(s): events and their
 * attendance, attendance members, metadata fields, and tags. Lets a year be
 * re-imported from a clean slate so a corrected import never leaves stale or
 * duplicate rows behind. Attendance is removed both via each event and by a
 * final sweep, so rows whose event lives in another year (none should, but be
 * safe) can't be orphaned. Admin-only; intended for dev re-imports.
 */
export const resetYears = mutation({
  args: { years: v.array(v.number()) },
  returns: v.object({
    events: v.number(),
    attendance: v.number(),
    members: v.number(),
    metadata: v.number(),
    tags: v.number(),
  }),
  handler: async (ctx, { years }) => {
    await requireAdmin(ctx);
    const yearSet = new Set(years);
    let events = 0;
    let attendance = 0;
    let members = 0;
    let metadata = 0;
    let tags = 0;

    for (const year of years) {
      const eventRows = await ctx.db
        .query("events")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect();
      for (const event of eventRows) {
        const rows = await ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        for (const row of rows) {
          await ctx.db.delete(row._id);
          attendance++;
        }
        await ctx.db.delete(event._id);
        events++;
      }
      for (const member of await ctx.db
        .query("attendanceMembers")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect()) {
        await ctx.db.delete(member._id);
        members++;
      }
      for (const field of await ctx.db
        .query("attendanceMetadata")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect()) {
        await ctx.db.delete(field._id);
        metadata++;
      }
      for (const tag of await ctx.db
        .query("attendanceTags")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect()) {
        await ctx.db.delete(tag._id);
        tags++;
      }
    }

    // Final sweep for any attendance row in these years whose event was already
    // gone (so a re-import can't collide with a leftover sign-in).
    for (const row of await ctx.db.query("attendance").take(20000)) {
      if (yearSet.has(row.year)) {
        await ctx.db.delete(row._id);
        attendance++;
      }
    }

    return { events, attendance, members, metadata, tags };
  },
});

export const mergeLegacyStaffMembers = mutation({
  args: { year: v.number() },
  returns: v.object({
    mergedMembers: v.number(),
    attendanceMoved: v.number(),
    attendanceDeduplicated: v.number(),
    skipped: v.array(
      v.object({
        memberId: v.id("attendanceMembers"),
        name: v.string(),
        email: v.optional(v.string()),
        reason: v.string(),
      })
    ),
  }),
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    const fields = await fieldsForYear(ctx, year);
    const members = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    let mergedMembers = 0;
    let attendanceMoved = 0;
    let attendanceDeduplicated = 0;
    const skipped: Array<{
      memberId: Id<"attendanceMembers">;
      name: string;
      email?: string;
      reason: string;
    }> = [];

    for (const member of members) {
      if (member.staffEmail) continue;
      // Candidate staff emails for this member, treating @sowaustralia.com and
      // @sow.org.au as the same person (profiles changed domain between staff
      // years), plus the Daniel Kim Snr name case. Personal/campus emails
      // produce no staff candidate and stay plain members.
      const candidates = staffEmailCandidates(member.email);
      const legacy = canonicalStaffEmailForLegacyMember(member);
      if (legacy && !candidates.includes(legacy)) candidates.unshift(legacy);
      if (candidates.length === 0) continue;

      // A calendar-year import spans two staff years (Sep 1 rollover), so a
      // member may be staff in either `year` (Jan–Aug events) or `year + 1`
      // (Sep–Dec events). Match against whichever year/domain has the profile;
      // the profile's own email becomes the link target.
      let profile: Awaited<ReturnType<typeof getProfile>> = null;
      for (const candidate of candidates) {
        profile =
          (await getProfile(ctx, candidate, year)) ??
          (await getProfile(ctx, candidate, year + 1));
        if (profile) break;
      }
      if (!profile) {
        skipped.push({
          memberId: member._id,
          name: member.name,
          email: member.email,
          reason: `No staff profile found for ${member.email ?? member.name}`,
        });
        continue;
      }
      const targetEmail = profile.email.toLowerCase();

      const existingOverlay = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_year_and_staff_email", (q) =>
          q.eq("year", year).eq("staffEmail", targetEmail)
        )
        .unique();
      const mergedMetadata = staffLockedMetadata(fields, profile, {
        ...(member.metadata ?? {}),
        ...(existingOverlay?.metadata ?? {}),
      });
      if (existingOverlay) {
        await ctx.db.patch(existingOverlay._id, {
          name: profile.name ?? member.name,
          email: targetEmail,
          staffEmail: targetEmail,
          metadata: mergedMetadata,
        });
      } else {
        await ctx.db.insert("attendanceMembers", {
          year,
          name: profile.name ?? member.name,
          email: targetEmail,
          staffEmail: targetEmail,
          metadata: mergedMetadata,
        });
      }

      const attendanceRows = await ctx.db
        .query("attendance")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .collect();
      for (const row of attendanceRows) {
        const existingAttendance = await ctx.db
          .query("attendance")
          .withIndex("by_event_and_email", (q) =>
            q.eq("eventId", row.eventId).eq("email", targetEmail)
          )
          .unique();
        if (existingAttendance) {
          await ctx.db.patch(existingAttendance._id, {
            signInTime: Math.min(existingAttendance.signInTime, row.signInTime),
            notes: mergeNotes(existingAttendance.notes, row.notes),
          });
          await ctx.db.delete(row._id);
          attendanceDeduplicated++;
        } else {
          await ctx.db.patch(row._id, {
            email: targetEmail,
            memberId: undefined,
          });
          attendanceMoved++;
        }
      }

      await ctx.db.delete(member._id);
      mergedMembers++;
    }

    return {
      mergedMembers,
      attendanceMoved,
      attendanceDeduplicated,
      skipped,
    };
  },
});

/** Rewrite legacy "ALL" org-wide subgroup values to "SOW" for one staff year. */
export const migrateOrgWideSubgroupToSow = mutation({
  args: { year: v.number() },
  returns: v.object({
    events: v.number(),
    tags: v.number(),
    metadata: v.number(),
  }),
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    let events = 0;
    let tags = 0;
    let metadata = 0;

    for (const event of await ctx.db
      .query("events")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()) {
      const normalized = normalizeSubgroups(event.subgroups);
      const changed =
        normalized.length !== event.subgroups.length ||
        normalized.some((subgroup, index) => subgroup !== event.subgroups[index]);
      if (changed) {
        await ctx.db.patch(event._id, { subgroups: normalized });
        events++;
      }
    }

    for (const tag of await ctx.db
      .query("attendanceTags")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()) {
      if (!tag.subgroups?.length) continue;
      const normalized = normalizeSubgroups(tag.subgroups);
      const changed =
        normalized.length !== tag.subgroups.length ||
        normalized.some((subgroup, index) => subgroup !== tag.subgroups![index]);
      if (changed) {
        await ctx.db.patch(tag._id, { subgroups: normalized });
        tags++;
      }
    }

    for (const field of await ctx.db
      .query("attendanceMetadata")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect()) {
      if (!field.subgroup) continue;
      const canonical = canonicalSubgroup(field.subgroup);
      if (canonical !== field.subgroup) {
        await ctx.db.patch(field._id, { subgroup: canonical });
        metadata++;
      }
    }

    return { events, tags, metadata };
  },
});

/** Restore canonical Gender options and remap member ids (e.g. legacy 3 → Female). */
export const repairGenderMetadata = mutation({
  args: { year: v.number() },
  returns: v.object({
    fieldPatched: v.boolean(),
    membersPatched: v.number(),
  }),
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    const fields = await fieldsForYear(ctx, year);
    const genderField = fields.find((field) => field.key === GENDER_FIELD_KEY);
    if (!genderField) {
      return { fieldPatched: false, membersPatched: 0 };
    }

    const values = canonicalizeGenderValues(genderField.values);
    const lockedValues = [...GENDER_OPTION_IDS, "Male", "Female"];
    const fieldPatched =
      JSON.stringify(genderField.values) !== JSON.stringify(values) ||
      JSON.stringify(genderField.lockedValues ?? []) !== JSON.stringify(lockedValues);
    if (fieldPatched) {
      await ctx.db.patch(genderField._id, { values, lockedValues });
    }

    let membersPatched = 0;
    const members = await ctx.db
      .query("attendanceMembers")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();
    for (const member of members) {
      const raw = member.metadata?.[genderField._id];
      if (!raw) continue;
      const canonical = canonicalizeGenderOptionId(raw, genderField.values);
      if (canonical === raw) continue;
      await ctx.db.patch(member._id, {
        metadata: { ...member.metadata, [genderField._id]: canonical },
      });
      membersPatched++;
    }

    return { fieldPatched, membersPatched };
  },
});

/**
 * Read-only audit of how every attendance row in a (calendar) year resolves:
 * staff (matched to a profile of the event-date staff year, either SOW domain),
 * a plain attendance member, or a problem. `memberShouldBeStaff` flags rows
 * still pointing at a member whose email matches a staff profile (i.e. a missed
 * link); `noProfileEmail` flags email rows with no profile for that staff year.
 */
export const auditAttendanceMapping = mutation({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    const events = await ctx.db
      .query("events")
      .withIndex("by_year", (q) => q.eq("year", year))
      .collect();

    let total = 0;
    let staffByEmail = 0;
    let plainMember = 0;
    const memberShouldBeStaff: Record<string, unknown>[] = [];
    const noProfileEmail: Record<string, unknown>[] = [];
    const missingMember: Record<string, unknown>[] = [];
    const noIdentifier = 0;

    for (const event of events) {
      const profileYear = staffYearForDate(new Date(event.dateStart));
      const rows = await ctx.db
        .query("attendance")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const row of rows) {
        total++;
        const findProfile = async (email: string | undefined) => {
          for (const candidate of staffEmailCandidates(email)) {
            const profile = await getProfile(ctx, candidate, profileYear);
            if (profile) return profile;
          }
          return null;
        };
        if (row.email) {
          if (await findProfile(row.email)) staffByEmail++;
          else noProfileEmail.push({ event: event.name, email: row.email, staffYear: profileYear });
        } else if (row.memberId) {
          const member = await ctx.db.get(row.memberId);
          if (!member) {
            missingMember.push({ event: event.name, memberId: row.memberId });
            continue;
          }
          const profile = await findProfile(member.email);
          if (profile) {
            memberShouldBeStaff.push({
              event: event.name,
              member: member.name,
              email: member.email,
              profile: profile.email,
              staffYear: profileYear,
            });
          } else {
            plainMember++;
          }
        }
      }
    }

    return {
      year,
      events: events.length,
      total,
      staffByEmail,
      plainMember,
      memberShouldBeStaffCount: memberShouldBeStaff.length,
      noProfileEmailCount: noProfileEmail.length,
      missingMemberCount: missingMember.length,
      noIdentifier,
      memberShouldBeStaff: memberShouldBeStaff.slice(0, 40),
      noProfileEmail: noProfileEmail.slice(0, 40),
      missingMember: missingMember.slice(0, 20),
    };
  },
});
