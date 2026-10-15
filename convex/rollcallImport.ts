import { v } from "convex/values";
import {
  eventStaffYear,
  staffYearStartMs,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  canonicalizeGenderOptionId,
  canonicalizeGenderValues,
  GENDER_FIELD_KEY,
  GENDER_OPTION_IDS,
  memberOwnMetadata,
  STUDENT_YEAR_FIELD_KEY,
  STUDENT_YEAR_VALUES,
  commencementYearFromLevel,
} from "../shared/attendanceMemberMeta";
import { canonicalSubgroup, normalizeSubgroups } from "../shared/rollcall";
import {
  canonicalImportMemberName,
  normalizedEmail,
  staffEmailCandidates,
} from "../shared/rollcallImport";
import { Id } from "./_generated/dataModel";
import { MutationCtx, mutation, query, QueryCtx } from "./_generated/server";
import { isAssigned, linkOrCreateMember } from "./staffMembers";

type Ctx = QueryCtx | MutationCtx;
import { getProfile, requireAdmin } from "./model";

const eventsInStaffYear = (ctx: Ctx, year: number) =>
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

async function allMetadataFields(ctx: Ctx) {
  return await ctx.db.query("attendanceMetadata").collect();
}

function metadataForMember(
  year: number,
  raw: Record<string, string> | undefined,
  fieldMap: Record<string, Id<"attendanceMetadata">>,
  byId: Map<string, Awaited<ReturnType<typeof allMetadataFields>>[number]>
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
    const { email: actorEmail } = await requireAdmin(ctx);
    let importedEvents = 0;
    let importedAttendance = 0;
    let skipped = 0;
    // Metadata fields are not year-scoped, so one read serves every event.
    const fields = await allMetadataFields(ctx);

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

      const calendarYear = sydneyCalendarYear(new Date(event.dateStart));
      const staffYear = eventStaffYear(event.dateStart);
      const fieldMap = fieldMapByYear[String(calendarYear)] ?? {};
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
        const baseMetadata = metadataForMember(
          calendarYear,
          row.metadata,
          fieldMap,
          fieldsById
        );
        const metadata = baseMetadata;
        const signInTime = row.signInTime ?? event.dateStart;

        let memberId: Id<"attendanceMembers">;
        if (profile && isAssigned(profile)) {
          memberId = await linkOrCreateMember(ctx, profile, actorEmail);
          const overlay = await ctx.db.get(memberId);
          await ctx.db.patch(memberId, {
            sourceImportId: row.source,
            metadata: memberOwnMetadata(fields, metadata, overlay?.metadata),
          });
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
            // Stored lower-cased like every other member write, so the
            // `by_email` lookups (and `findMemberByEmail`) can find the row.
            email: normalizedEmail(row.email),
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

export const summary = query({
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

