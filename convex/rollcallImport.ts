import { v } from "convex/values";
import {
  assignmentsOf,
  eventStaffYear,
  rolesOfLike,
  staffYearForDate,
  staffYearStartMs,
} from "../shared/flow";
import {
  CAMPUS_FIELD_KEY,
  canonicalizeGenderOptionId,
  canonicalizeGenderValues,
  GENDER_FIELD_KEY,
  GENDER_OPTION_IDS,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  STUDENT_YEAR_VALUES,
  commencementYearFromLevel,
} from "../shared/attendanceMemberMeta";
import { canonicalSubgroup, normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import {
  canonicalImportMemberName,
  canonicalStaffEmailFromLegacy,
  staffEmailCandidates,
} from "../shared/rollcallImport";
import { Id } from "./_generated/dataModel";
import { MutationCtx, mutation } from "./_generated/server";
import { findMemberByEmail, getProfile, requireAdmin } from "./model";

const eventsInStaffYear = (ctx: MutationCtx, year: number) =>
  ctx.db
    .query("events")
    .withIndex("by_dateStart", (q) =>
      q
        .gte("dateStart", staffYearStartMs(year))
        .lt("dateStart", staffYearStartMs(year + 1))
    );

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

const eventMemberInput = v.object({
  source: v.optional(v.string()),
  resolved: v.optional(v.boolean()),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  staffEmail: v.optional(v.string()),
  metadata: v.optional(v.record(v.string(), v.string())),
  signInTime: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const eventInput = v.object({
  sourceImportId: v.string(),
  name: v.string(),
  dateStart: v.number(),
  dateEnd: v.number(),
  subgroup: v.string(),
  collaboration: v.array(v.string()),
  tagIds: v.array(v.string()),
  members: v.array(eventMemberInput),
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

function calendarYearOf(dateMs: number): number {
  return new Date(dateMs + 10 * 60 * 60 * 1000).getUTCFullYear();
}

async function allMetadataFields(ctx: MutationCtx) {
  return await ctx.db.query("attendanceMetadata").collect();
}

const normalizedEmail = (email: string | undefined): string | undefined => {
  const lower = email?.trim().toLowerCase();
  return lower && lower.includes("@") ? lower : undefined;
};

const staffLockedMetadata = (
  fields: Awaited<ReturnType<typeof allMetadataFields>>,
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
  fieldsByKey: Map<string, Awaited<ReturnType<typeof allMetadataFields>>[number]>,
  byId: Map<string, Awaited<ReturnType<typeof allMetadataFields>>[number]>,
  staffEmail?: string
) {
  const out: Record<string, string> = {};
  for (const [oldFieldId, value] of Object.entries(raw ?? {})) {
    const fieldId = fieldMap[oldFieldId];
    const field = fieldId ? byId.get(fieldId) : null;
    if (!field || !value) continue;
    if (field.key === STUDENT_YEAR_FIELD_KEY) {
      const label = field.values?.[value] ?? value;
      const commencement = commencementYearFromLevel(label, year);
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
  handler: async (ctx, { metadata, tags }) => {
    await requireAdmin(ctx);
    const existingFields = await allMetadataFields(ctx);
    const fieldMap: Record<string, Id<"attendanceMetadata">> = {};

    for (const field of metadata) {
      const key = field.key.trim();
      if (!key) continue;
      const subgroup = field.subgroup ? canonicalSubgroup(field.subgroup) : undefined;
      const existing = existingFields.find(
        (row) =>
          row.key.toLowerCase() === key.toLowerCase() &&
          canonicalSubgroup(row.subgroup ?? "") === canonicalSubgroup(subgroup ?? "")
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
        subgroup,
        ...(key === GENDER_FIELD_KEY
          ? { lockedValues: [...GENDER_OPTION_IDS, "Male", "Female"] }
          : {}),
      };
      const id = existing?._id ?? (await ctx.db.insert("attendanceMetadata", patch));
      if (existing) await ctx.db.patch(existing._id, patch);
      for (const oldId of field.sourceIds ?? []) fieldMap[oldId] = id;
    }

    const fieldsAfter = await allMetadataFields(ctx);
    for (const field of metadata) {
      const subgroup = field.subgroup ? canonicalSubgroup(field.subgroup) : undefined;
      const row = fieldsAfter.find(
        (candidate) =>
          candidate.key.toLowerCase() === field.key.toLowerCase() &&
          canonicalSubgroup(candidate.subgroup ?? "") === canonicalSubgroup(subgroup ?? "")
      );
      if (!row) continue;
      fieldMap[field.key] = row._id;
      for (const sourceId of field.sourceIds ?? []) fieldMap[sourceId] = row._id;
    }

    const existingTags = await ctx.db.query("attendanceTags").collect();
    const tagByName = new Map(
      existingTags.map((row) => [row.name.trim().toLowerCase(), row])
    );
    const tagMap: Record<string, Id<"attendanceTags">> = {};
    for (const tag of tags) {
      const name = tag.name.trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      const subgroups = tag.subgroups?.length
        ? normalizeSubgroups(tag.subgroups)
        : undefined;
      const existing = tagByName.get(lower);
      if (existing) {
        await ctx.db.patch(existing._id, { colour: tag.colour, subgroups });
      }
      const id =
        tagMap[lower] ??
        existing?._id ??
        (await ctx.db.insert("attendanceTags", {
          name,
          colour: tag.colour,
          subgroups,
        }));
      tagMap[lower] = id;
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
    const fields = await allMetadataFields(ctx);
    const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
    const fieldsById = new Map(fields.map((field) => [field._id, field]));
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
        fieldsById,
        profile?.email
      );
      if (profile) {
        staffOverlays++;
        const existing = await findMemberByEmail(ctx, profile.email);
        const patch = {
          name: profile.name ?? displayName,
          email: profile.email,
          sourceImportId: member.sourceImportId,
          metadata,
        };
        if (existing) await ctx.db.patch(existing._id, patch);
        else await ctx.db.insert("attendanceMembers", patch);
        imported++;
        continue;
      }

      const existing = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_source_import_id", (q) =>
          q.eq("sourceImportId", member.sourceImportId)
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
      else await ctx.db.insert("attendanceMembers", patch);
      imported++;
    }
    return { imported, staffOverlays };
  },
});

export const importEvents = mutation({
  args: {
    tagMap: v.record(v.string(), v.id("attendanceTags")),
    fieldMapByYear: v.record(
      v.string(),
      v.record(v.string(), v.id("attendanceMetadata"))
    ),
    events: v.array(eventInput),
  },
  returns: v.object({
    importedEvents: v.number(),
    importedAttendance: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, { tagMap, fieldMapByYear, events }) => {
    await requireAdmin(ctx);
    let importedEvents = 0;
    let importedAttendance = 0;
    let skipped = 0;
    const fieldsByYear = new Map<
      number,
      Awaited<ReturnType<typeof allMetadataFields>>
    >();
    const fieldsFor = async (cy: number) => {
      const cached = fieldsByYear.get(cy);
      if (cached) return cached;
      const rows = await allMetadataFields(ctx);
      fieldsByYear.set(cy, rows);
      return rows;
    };

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
        .withIndex("by_sourceImportId", (q) =>
          q.eq("sourceImportId", event.sourceImportId)
        )
        .unique();
      const patch = {
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

      const calendarYear = calendarYearOf(event.dateStart);
      const staffYear = eventStaffYear(event.dateStart);
      const fieldMap = fieldMapByYear[String(calendarYear)] ?? {};
      const fields = await fieldsFor(calendarYear);
      const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
      const fieldsById = new Map(fields.map((field) => [field._id, field]));

      for (const row of event.members) {
        const displayName = canonicalImportMemberName(row.name ?? "");
        if (!row.resolved || !displayName) {
          skipped++;
          continue;
        }
        let profile: Awaited<ReturnType<typeof getProfile>> = null;
        for (const candidate of staffEmailCandidates(row.staffEmail ?? row.email)) {
          profile = await getProfile(ctx, candidate, staffYear);
          if (profile) break;
        }
        const baseMetadata = await metadataForMember(
          ctx,
          calendarYear,
          row.metadata,
          fieldMap,
          fieldsByKey,
          fieldsById
        );
        const metadata = profile
          ? staffLockedMetadata(fields, profile, baseMetadata)
          : baseMetadata;
        const signInTime = row.signInTime ?? event.dateStart;

        let memberId: Id<"attendanceMembers">;
        if (profile) {
          const staffEmail = profile.email.toLowerCase();
          const overlay = await findMemberByEmail(ctx, staffEmail);
          const memberPatch = {
            name: profile.name ?? displayName,
            email: staffEmail,
            sourceImportId: row.source,
            metadata,
          };
          if (overlay) {
            await ctx.db.patch(overlay._id, memberPatch);
            memberId = overlay._id;
          } else {
            memberId = await ctx.db.insert("attendanceMembers", memberPatch);
          }
        } else {
          const existingMember = row.source
            ? await ctx.db
                .query("attendanceMembers")
                .withIndex("by_source_import_id", (q) =>
                  q.eq("sourceImportId", row.source)
                )
                .unique()
            : null;
          const memberPatch = {
            name: displayName,
            email: row.email,
            sourceImportId: row.source,
            metadata,
          };
          if (existingMember) {
            await ctx.db.patch(existingMember._id, memberPatch);
            memberId = existingMember._id;
          } else {
            memberId = await ctx.db.insert("attendanceMembers", memberPatch);
          }
        }

        const existingAttendance = await ctx.db
          .query("attendance")
          .withIndex("by_event_and_member", (q) =>
            q.eq("eventId", eventId).eq("memberId", memberId)
          )
          .unique();
        const attendancePatch = {
          eventId,
          memberId,
          signInTime,
          notes: row.notes?.trim() || undefined,
        };
        if (existingAttendance) {
          await ctx.db.patch(existingAttendance._id, attendancePatch);
        } else {
          await ctx.db.insert("attendance", attendancePatch);
        }
        importedAttendance++;
      }
    }
    return { importedEvents, importedAttendance, skipped };
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
      metadata: (await ctx.db.query("attendanceMetadata").take(1000)).length,
      tags: (await ctx.db.query("attendanceTags").take(1000)).length,
      members: (
        await ctx.db
          .query("attendanceMembers")
          .collect()
      ).length,
      events: (await eventsInStaffYear(ctx, year).take(1000)).length,
      attendance: (
        await Promise.all(
          (await eventsInStaffYear(ctx, year).take(1000)).map((e) =>
            ctx.db
              .query("attendance")
              .withIndex("by_event", (q) => q.eq("eventId", e._id))
              .collect()
          )
        )
      ).reduce((sum, rows) => sum + rows.length, 0),
    };
  },
});

export const resetYears = mutation({
  args: { years: v.array(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, { years, limit = 400 }) => {
    await requireAdmin(ctx);
    let deleted = 0;

    for (const year of years) {
      while (deleted < limit) {
        const eventBatch = await eventsInStaffYear(ctx, year).take(20);
        if (eventBatch.length === 0) break;
        let progressed = false;
        for (const event of eventBatch) {
          if (deleted >= limit) break;
          const rows = await ctx.db
            .query("attendance")
            .withIndex("by_event", (q) => q.eq("eventId", event._id))
            .take(200);
          for (const row of rows) {
            await ctx.db.delete(row._id);
            deleted++;
          }
          if (rows.length < 200) {
            await ctx.db.delete(event._id);
            deleted++;
            progressed = true;
          } else {
            progressed = true;
          }
        }
        if (!progressed) break;
      }

    }

    let done = true;
    for (const year of years) {
      if (await eventsInStaffYear(ctx, year).first()) {
        done = false;
        break;
      }
    }

    return { deleted, done };
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
    const fields = await allMetadataFields(ctx);
    const members = await ctx.db
      .query("attendanceMembers")
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
      const candidates = staffEmailCandidates(member.email);
      const legacy = canonicalStaffEmailForLegacyMember(member);
      if (legacy && !candidates.includes(legacy)) candidates.unshift(legacy);
      if (candidates.length === 0) continue;

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
      if ((member.email ?? "").toLowerCase() === targetEmail) continue;

      const found = await findMemberByEmail(ctx, targetEmail);
      const existingOverlay = found && found._id !== member._id ? found : null;
      const mergedMetadata = staffLockedMetadata(fields, profile, {
        ...(member.metadata ?? {}),
        ...(existingOverlay?.metadata ?? {}),
      });
      if (existingOverlay) {
        await ctx.db.patch(existingOverlay._id, {
          name: profile.name ?? member.name,
          email: targetEmail,
          metadata: mergedMetadata,
        });
      } else {
        await ctx.db.insert("attendanceMembers", {
          name: profile.name ?? member.name,
          email: targetEmail,
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

    for (const event of await eventsInStaffYear(ctx, year).collect()) {
      const normalized = normalizeSubgroups(event.subgroups);
      const changed =
        normalized.length !== event.subgroups.length ||
        normalized.some((subgroup, index) => subgroup !== event.subgroups[index]);
      if (changed) {
        await ctx.db.patch(event._id, { subgroups: normalized });
        events++;
      }
    }

    for (const tag of await ctx.db.query("attendanceTags").collect()) {
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

    for (const field of await ctx.db.query("attendanceMetadata").collect()) {
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

export const repairGenderMetadata = mutation({
  args: { year: v.number() },
  returns: v.object({
    fieldPatched: v.boolean(),
    membersPatched: v.number(),
  }),
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    const fields = await allMetadataFields(ctx);
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

export const auditAttendanceMapping = mutation({
  args: { year: v.number() },
  handler: async (ctx, { year }) => {
    await requireAdmin(ctx);
    const events = await eventsInStaffYear(ctx, year).collect();

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
