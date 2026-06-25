import { v } from "convex/values";
import { staffYearForDate, sydneyCalendarYear } from "../shared/flow";
import {
  formatMetadataFieldValue,
  resolveCommencementStaffYear,
  STUDENT_YEAR_FIELD_KEY,
} from "../shared/attendanceMemberMeta";
import {
  eventIncludesSubgroup,
  normalizeSubgroups,
  subgroupMatches,
} from "../shared/rollcall";
import { staffEmailCandidates } from "../shared/rollcallImport";
import { Doc } from "./_generated/dataModel";
import { QueryCtx, query } from "./_generated/server";
import { optionalProfile } from "./model";

/** One signed-in person, flattened for the export. */
export type ExportRow = {
  name: string;
  email: string;
  signInTime: number;
  notes?: string;
  /** Resolved display value per metadata field, keyed by the field's KEY
   * (stable across years) so the CSV columns line up regardless of which
   * year's field ids produced them. */
  metadata: Record<string, string>;
};

/** One event with its roll-call, ready to turn into CSV rows. */
export type ExportEvent = {
  _id: string;
  name: string;
  dateStart: number;
  dateEnd: number;
  subgroups: string[];
  collaborative: boolean;
  /** The other sub-groups this event is shared with (empty unless collaborative). */
  collaborators: string[];
  tags: string[];
  attendanceCount: number;
  rows: ExportRow[];
};

type MemberDoc = Doc<"attendanceMembers">;

const first = <T>(arr: (T | null | undefined)[]): T | null =>
  arr.find((x): x is T => !!x) ?? null;

/**
 * Builds the per-event export payloads for a set of events, resolving each
 * signed-in person's name, email and metadata the same way the event screen
 * does — staff identity comes from their profile (event-date staff year),
 * member fields from the attendance member overlay (event calendar year), and
 * metadata values are filtered to the fields the `subgroup` can see.
 */
async function resolveExportEvents(
  ctx: QueryCtx,
  events: Doc<"events">[],
  subgroup: string
): Promise<ExportEvent[]> {
  // The shared member pool, loaded once. Maps let us resolve a row's metadata
  // source without an extra read per attendance row.
  const members = await ctx.db.query("attendanceMembers").collect();
  const memberById = new Map<string, MemberDoc>(
    members.map((m) => [String(m._id), m])
  );
  const memberByStaffEmail = new Map<string, MemberDoc>();
  for (const m of members) {
    for (const candidate of staffEmailCandidates(m.staffEmail ?? m.email)) {
      if (!memberByStaffEmail.has(candidate)) memberByStaffEmail.set(candidate, m);
    }
  }

  // Staff profiles + metadata fields are reused across events of the same year.
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
  // Metadata fields are global; a group only ever exports the metadata it can
  // see. Loaded once for the whole export.
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
        // Year exports the member's commencement (start) staff year, not the
        // year level relative to the event — so it's stable across events.
        if (field.key === STUDENT_YEAR_FIELD_KEY) {
          const startYear = resolveCommencementStaffYear(
            raw,
            calendarYear,
            field.values
          );
          if (startYear !== null) result[field.key] = String(startYear);
          continue;
        }
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
      first(staffEmailCandidates(email).map((c) => memberByStaffEmail.get(c)));

    const rows: ExportRow[] = attendanceRows
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
          };
        }
        if (row.memberId) {
          const member = memberById.get(String(row.memberId));
          // A member whose email belongs to a staff profile this year is shown
          // (and de-duplicated) as that staff member, mirroring the event screen.
          if (member?.email) {
            const profile = profileFor(member.email);
            if (profile) {
              return {
                name: profile.name ?? member.name,
                email: profile.email.toLowerCase(),
                signInTime: row.signInTime,
                notes: row.notes,
                metadata: resolveMetadata(member.metadata),
              };
            }
          }
          return {
            name: member?.name ?? "Unknown",
            email: member?.email ?? "",
            signInTime: row.signInTime,
            notes: row.notes,
            metadata: resolveMetadata(member?.metadata),
          };
        }
        return {
          name: "Unknown",
          email: "",
          signInTime: row.signInTime,
          notes: row.notes,
          metadata: {},
        };
      })
      .sort((a, b) => b.signInTime - a.signInTime);

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
      attendanceCount: attendanceRows.length,
      rows,
    });
  }
  return out;
}

/**
 * Export data for one sub-group: every event it can see (its own plus
 * collaborative events shared with it), optionally narrowed to a date range
 * (by event start) and/or a set of tags. Returns null when not signed in.
 */
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

    // Scoped by date range, not staff year, on purpose: an export may span the
    // Oct-1 rollover (or several years). Each event still resolves its own
    // staff/calendar year for profiles and member fields in resolveExportEvents.
    const all = await ctx.db.query("events").collect();
    const events = all
      .filter((e) => eventIncludesSubgroup(e.subgroups, subgroup))
      .filter((e) => dateStart == null || e.dateStart >= dateStart)
      .filter((e) => dateEnd == null || e.dateStart <= dateEnd)
      .filter(
        (e) =>
          !tagFilter ||
          (e.tagIds ?? []).some((id) => tagFilter.has(String(id)))
      )
      .sort((a, b) => a.dateStart - b.dateStart);

    return { subgroup, events: await resolveExportEvents(ctx, events, subgroup) };
  },
});

/**
 * Export data for a single event (the event page's "Export this event"), with
 * metadata scoped to the event's owning sub-group. Returns null if not signed
 * in or the event is gone.
 */
export const eventForExport = query({
  args: { eventId: v.id("events"), subgroup: v.optional(v.string()) },
  handler: async (ctx, { eventId, subgroup }) => {
    if (!(await optionalProfile(ctx))) return null;
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    // Scope metadata to the caller's active sub-group when given (the event
    // screen passes the one it's viewing); otherwise fall back to the owner.
    const scope = subgroup ?? normalizeSubgroups(event.subgroups)[0] ?? "SOW";
    const [resolved] = await resolveExportEvents(ctx, [event], scope);
    return resolved ? { subgroup: scope, event: resolved } : null;
  },
});
