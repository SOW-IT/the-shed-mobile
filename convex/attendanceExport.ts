import { v } from "convex/values";
import { staffYearForDate, sydneyCalendarYear } from "../shared/flow";
import { formatMetadataFieldValue } from "../shared/attendanceMemberMeta";
import {
  eventIncludesSubgroup,
  normalizeSubgroups,
  subgroupMatches,
} from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { QueryCtx, query } from "./_generated/server";
import { optionalProfile } from "./model";

export type ExportRow = {
  name: string;
  email: string;
  signInTime: number;
  notes?: string;
  metadata: Record<string, string>;
  identityKey: string;
};

export type ExportEvent = {
  _id: string;
  name: string;
  dateStart: number;
  dateEnd: number;
  subgroups: string[];
  collaborative: boolean;
  collaborators: string[];
  tags: string[];
  attendanceCount: number;
  rows: ExportRow[];
};

type MemberDoc = Doc<"attendanceMembers">;

const first = <T>(arr: (T | null | undefined)[]): T | null =>
  arr.find((x): x is T => !!x) ?? null;

async function resolveExportEvents(
  ctx: QueryCtx,
  events: Doc<"events">[],
  subgroup: string
): Promise<ExportEvent[]> {
  const members = await ctx.db.query("attendanceMembers").collect();
  const memberById = new Map<string, MemberDoc>(
    members.map((m) => [String(m._id), m])
  );
  const memberByEmail = new Map<string, MemberDoc>();
  for (const m of members) {
    for (const candidate of staffEmailCandidates(m.email)) {
      if (!memberByEmail.has(candidate)) memberByEmail.set(candidate, m);
    }
  }

  const profilesByYear = new Map<number, Map<string, Doc<"staffProfiles">>>();
  const loadProfiles = async (year: number) => {
    let map = profilesByYear.get(year);
    if (!map) {
      const rows = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect();
      map = new Map(rows.map((p) => [p.email.toLowerCase(), p]));
      profilesByYear.set(year, map);
    }
    return map;
  };
  const fields = (await ctx.db.query("attendanceMetadata").collect())
    .filter((f) => !f.subgroup || subgroupMatches(f.subgroup, subgroup))
    .sort((a, b) => a.order - b.order);

  const out: ExportEvent[] = [];
  for (const event of events) {
    const staffYear = staffYearForDate(new Date(event.dateStart));
    const calendarYear = sydneyCalendarYear(new Date(event.dateStart));
    const profiles = await loadProfiles(staffYear);
    const attendanceRows = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();

    const resolveMetadata = (
      source: Record<string, string> | undefined
    ): Record<string, string> => {
      const result: Record<string, string> = {};
      for (const field of fields) {
        const raw = source?.[field._id];
        if (!raw) continue;
        const label = formatMetadataFieldValue(
          field.key,
          raw,
          calendarYear,
          field.values
        );
        if (label) result[field.key] = label;
      }
      return result;
    };

    const profileFor = (email: string) =>
      first(staffEmailCandidates(email).map((c) => profiles.get(c)));
    const shadowFor = (email: string) =>
      first(staffEmailCandidates(email).map((c) => memberByEmail.get(c)));

    const resolvedRows: ExportRow[] = attendanceRows
      .map((row): ExportRow => {
        if (row.email) {
          const profile = profileFor(row.email);
          const shadow = shadowFor(row.email);
          const email = profile?.email.toLowerCase() ?? row.email.toLowerCase();
          return {
            name: profile?.name ?? shadow?.name ?? email,
            email,
            signInTime: row.signInTime,
            notes: row.notes,
            metadata: resolveMetadata(shadow?.metadata),
            identityKey: `email:${email}`,
          };
        }
        if (row.memberId) {
          const member = memberById.get(String(row.memberId));
          if (member?.email) {
            const profile = profileFor(member.email);
            if (profile) {
              const email = profile.email.toLowerCase();
              return {
                name: profile.name ?? member.name,
                email,
                signInTime: row.signInTime,
                notes: row.notes,
                metadata: resolveMetadata(member.metadata),
                identityKey: `email:${email}`,
              };
            }
          }
          const email = member?.email?.toLowerCase() ?? "";
          return {
            name: member?.name ?? "Unknown",
            email,
            signInTime: row.signInTime,
            notes: row.notes,
            metadata: resolveMetadata(member?.metadata),
            identityKey: email
              ? `email:${email}`
              : `member:${String(row.memberId)}`,
          };
        }
        return {
          name: "Unknown",
          email: "",
          signInTime: row.signInTime,
          notes: row.notes,
          metadata: {},
          identityKey: `row:${String(row._id)}`,
        };
      });
    const byIdentity = new Map<string, ExportRow>();
    const rows: ExportRow[] = [];
    for (const row of resolvedRows) {
      const existing = byIdentity.get(row.identityKey);
      if (!existing) {
        byIdentity.set(row.identityKey, row);
        rows.push(row);
      } else if (row.signInTime < existing.signInTime) {
        existing.signInTime = row.signInTime;
        existing.notes = row.notes;
        existing.metadata = row.metadata;
        existing.name = row.name;
        if (row.email) existing.email = row.email;
      }
    }
    rows.sort((a, b) => b.signInTime - a.signInTime);

    const tags = await Promise.all(
      (event.tagIds ?? []).map((id) => ctx.db.get(id))
    );
    const subgroups = normalizeSubgroups(event.subgroups);
    out.push({
      _id: String(event._id),
      name: event.name,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      subgroups,
      collaborative: subgroups.length > 1,
      collaborators: subgroups.filter((s) => !subgroupMatches(s, subgroup)),
      tags: tags
        .filter((t): t is Doc<"attendanceTags"> => !!t)
        .map((t) => t.name),
      attendanceCount: rows.length,
      rows,
    });
  }
  return out;
}

export const eventsForExport = query({
  args: {
    subgroup: v.string(),
    dateStart: v.optional(v.number()),
    dateEnd: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
  },
  handler: async (ctx, { subgroup, dateStart, dateEnd, tagIds }) => {
    if (!(await optionalProfile(ctx))) return null;
    const tagFilter = tagIds?.length
      ? new Set(tagIds.map((id) => String(id)))
      : null;

    const all = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => {
        if (dateStart != null && dateEnd != null) {
          return q.gte("dateStart", dateStart).lte("dateStart", dateEnd);
        }
        if (dateStart != null) return q.gte("dateStart", dateStart);
        if (dateEnd != null) return q.lte("dateStart", dateEnd);
        return q;
      })
      .collect();
    const events = all
      .filter((e) => eventIncludesSubgroup(e.subgroups, subgroup))
      .filter(
        (e) =>
          !tagFilter ||
          (e.tagIds ?? []).some((id) => tagFilter.has(String(id)))
      )
      .sort((a, b) => a.dateStart - b.dateStart);

    return { subgroup, events: await resolveExportEvents(ctx, events, subgroup) };
  },
});

export const eventForExport = query({
  args: { eventId: v.id("events"), subgroup: v.optional(v.string()) },
  handler: async (ctx, { eventId, subgroup }) => {
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const scope = subgroup ?? normalizeSubgroups(event.subgroups)[0] ?? "SOW";
    const [resolved] = await resolveExportEvents(ctx, [event], scope);
    return resolved ? { subgroup: scope, event: resolved } : null;
  },
});
