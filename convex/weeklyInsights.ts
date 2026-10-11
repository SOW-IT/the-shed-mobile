import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { CAMPUS_FIELD_KEY, ROLE_FIELD_KEY } from "../shared/attendanceMemberMeta";
import { DAY_MS, rangeStartFor, WEEK_MS } from "../shared/attendanceMetrics";
import { type ViewBlock } from "../shared/attendanceMetricsView";
import {
  assignmentsOf,
  eventStaffYear,
  roleNeedsUniversity,
  staffYearStartMs,
  sydneyCalendarYear,
} from "../shared/flow";
import {
  canonicalSubgroup,
  eventIncludesSubgroup,
  isOrgWideSubgroup,
  normalizeSubgroups,
  personDisplayName,
  personKey,
  subgroupLabel,
  WEEKLY_MEETING_TAG_NAME,
} from "../shared/rollcall";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import {
  computeTerm,
  computeYear,
  DEFAULT_WEEKLY_SETTINGS,
  deriveTerms,
  followUps,
  type HeldWeekly,
  sameTermLastYear,
  type TermFacts,
  termRows,
  termSystemFor,
  looksWeekly,
  suggestWeekly as suggestFrom,
  termOptions,
  weeklyName,
  type WeeklyMark,
  type WeeklyPerson,
  type WeeklySettings,
} from "../shared/weeklyInsights";
import {
  buildMemberBlocks,
  buildTermBlocks,
  buildYearBlocks,
  type MemberEvent,
} from "../shared/weeklyInsightsView";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { currentStaffYear, optionalProfile } from "./model";
import {
  termFactsFields,
  weeklyBlockValidator,
  weeklyMarkValidator,
  weeklySettingsFields,
} from "./weeklyInsightsData";

// Insights → Attendance for each campus, built around its weekly meetings.
// The rules live in shared/weeklyInsights.ts; this file stores their inputs
// and results. A nightly build looks at the attendance change log since its
// last run and only redoes what changed: usually just the current term, often
// nothing at all. See docs/adr/0008-weekly-insights.md.

const MAX_EVENTS = 5000;
const EVENTS_PAGE = 1000;
const MAX_AUDIT_ROWS = 5000;
const MAX_TERMS = 200;
const MAX_PROFILES_PER_YEAR = 3000;
const MAX_MEMBER_EVENTS = 500;
const GATHER_CHUNK = 20;
const PEOPLE_CHUNK = 300;
// The SOW view compares campuses over at most a year.
const INDEX_WEEKLIES_WEEKS = 60;
const NEVER = Number.MAX_SAFE_INTEGER;
// Bump when what a view shows changes, so every campus redoes its views on
// the next build after a deploy.
export const VIEW_VERSION = 2;

export async function readSettings(
  ctx: QueryCtx
): Promise<{ settings: WeeklySettings; version: number; id: Id<"weeklyInsightsSettings"> | null }> {
  const row = await ctx.db.query("weeklyInsightsSettings").first();
  if (!row) return { settings: DEFAULT_WEEKLY_SETTINGS, version: 0, id: null };
  const { _id, _creationTime, version, ...settings } = row;
  return { settings: { ...DEFAULT_WEEKLY_SETTINGS, ...settings }, version, id: _id };
}

const settingsValidator = v.object(weeklySettingsFields);

const indexFor = (ctx: QueryCtx, subgroup: string) =>
  ctx.db
    .query("weeklyInsightIndex")
    .withIndex("by_subgroup", (q) => q.eq("subgroup", subgroup))
    .unique();

async function weeklyTagIds(ctx: QueryCtx): Promise<Set<Id<"attendanceTags">>> {
  const tags = await ctx.db.query("attendanceTags").take(500);
  return new Set(tags.filter((t) => t.name === WEEKLY_MEETING_TAG_NAME).map((t) => t._id));
}

type FactsDoc = Doc<"weeklyTermFacts">;

const toFacts = (doc: FactsDoc): TermFacts => ({
  key: doc.termKey,
  label: doc.label,
  year: doc.year,
  slot: doc.slot,
  system: doc.system,
  weeklies: doc.weeklies,
  attendance: Object.fromEntries(doc.attendance.map((a) => [a.key, a.indexes])),
});

async function loadFacts(ctx: QueryCtx, subgroup: string): Promise<TermFacts[]> {
  const docs = await ctx.db
    .query("weeklyTermFacts")
    .withIndex("by_subgroup_and_termKey", (q) => q.eq("subgroup", subgroup))
    .take(MAX_TERMS);
  return docs.map(toFacts).sort((a, b) => a.weeklies[0].at - b.weeklies[0].at);
}

// ---------------------------------------------------------------------------
// Build

const checkResult = v.object({
  settings: settingsValidator,
  version: v.number(),
  hasIndex: v.boolean(),
  settingsChanged: v.boolean(),
  eventIds: v.array(v.id("events")),
  memberKeys: v.array(v.string()),
  goneMemberKeys: v.array(v.string()),
  tagChanged: v.boolean(),
  compareDue: v.boolean(),
  auditMax: v.number(),
  eventsMax: v.number(),
  needsBuild: v.boolean(),
});

/** What changed for this campus since its last build. */
export const checkChanges = internalQuery({
  args: { subgroup: v.string(), now: v.number() },
  returns: checkResult,
  handler: async (ctx, { subgroup, now }) => {
    const { settings, version } = await readSettings(ctx);
    const index = await indexFor(ctx, subgroup);
    const latestAudit = await ctx.db.query("attendanceAuditLog").order("desc").first();
    const latestEvent = await ctx.db.query("events").order("desc").first();
    if (!index) {
      // A first build reads everything, so the change log so far is covered.
      return {
        settings,
        version,
        hasIndex: false,
        settingsChanged: true,
        eventIds: [],
        memberKeys: [],
        goneMemberKeys: [],
        tagChanged: false,
        compareDue: false,
        auditMax: latestAudit?._creationTime ?? 0,
        eventsMax: latestEvent?._creationTime ?? 0,
        needsBuild: true,
      };
    }
    const audit = await ctx.db
      .query("attendanceAuditLog")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", index.auditSeen))
      .take(MAX_AUDIT_ROWS);
    const created = await ctx.db
      .query("events")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", index.eventsSeen))
      .take(MAX_EVENTS);
    const eventIds = new Set<Id<"events">>(created.map((e) => e._id));
    const memberIds = new Set<Id<"attendanceMembers">>();
    let tagChanged = false;
    for (const row of audit) {
      if (row.eventId) eventIds.add(row.eventId);
      if (row.memberId) memberIds.add(row.memberId);
      if (row.entityType === "tag") tagChanged = true;
    }
    const relevant: Id<"events">[] = [];
    for (const id of eventIds) {
      const event = await ctx.db.get("events", id);
      // A deleted event may have been one of this campus's weeklies.
      if (!event || eventIncludesSubgroup(event.subgroups, subgroup)) relevant.push(id);
    }
    const memberKeys: string[] = [];
    const goneMemberKeys: string[] = [];
    for (const id of memberIds) {
      const member = await ctx.db.get("attendanceMembers", id);
      const keys = [`member:${id}`, ...(member?.email ? [`staff:${canonicalEmailKey(member.email)}`] : [])];
      (member ? memberKeys : goneMemberKeys).push(...keys);
    }
    const settingsChanged = index.settingsVersion !== version || index.viewVersion !== VIEW_VERSION;
    const compareDue = index.nextCompareAt <= now;
    return {
      settings,
      version,
      hasIndex: true,
      settingsChanged,
      eventIds: relevant,
      memberKeys,
      goneMemberKeys,
      tagChanged,
      compareDue,
      auditMax: audit.length ? audit[audit.length - 1]._creationTime : index.auditSeen,
      eventsMax: created.length ? created[created.length - 1]._creationTime : index.eventsSeen,
      needsBuild:
        settingsChanged ||
        compareDue ||
        tagChanged ||
        relevant.length > 0 ||
        memberKeys.length > 0 ||
        goneMemberKeys.length > 0,
    };
  },
});

const weeklyEventValidator = v.object({
  eventId: v.id("events"),
  at: v.number(),
  joint: v.boolean(),
  name: v.string(),
  mark: v.union(v.null(), weeklyMarkValidator),
});

/** One page of this campus's weekly meetings so far, newest first. Every
 *  page is read, so no old term looks deleted because of a cap. */
export const weeklyEventsPage = internalQuery({
  args: {
    subgroup: v.string(),
    now: v.number(),
    includeJoint: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(weeklyEventValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { subgroup, now, includeJoint, paginationOpts }) => {
    const weekly = await weeklyTagIds(ctx);
    const result = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.lte("dateStart", now))
      .order("desc")
      .paginate(paginationOpts);
    return {
      page: result.page
        .filter(
          (e) =>
            eventIncludesSubgroup(e.subgroups, subgroup) &&
            (e.tagIds ?? []).some((id) => weekly.has(id)) &&
            (includeJoint || normalizeSubgroups(e.subgroups).length === 1)
        )
        .map((e) => ({
          eventId: e._id,
          at: e.dateStart,
          joint: normalizeSubgroups(e.subgroups).length > 1,
          name: e.name,
          mark: e.weekly ?? null,
        })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** This campus's stored term facts. */
export const loadFactsDocs = internalQuery({
  args: { subgroup: v.string() },
  returns: v.array(v.object({ _id: v.id("weeklyTermFacts"), _creationTime: v.number(), ...termFactsFields })),
  handler: (ctx, { subgroup }) =>
    ctx.db
      .query("weeklyTermFacts")
      .withIndex("by_subgroup_and_termKey", (q) => q.eq("subgroup", subgroup))
      .take(MAX_TERMS),
});

/** Who signed in to each event, as person keys. */
export const attendanceFor = internalQuery({
  args: { eventIds: v.array(v.id("events")) },
  returns: v.array(v.object({ eventId: v.id("events"), keys: v.array(v.string()) })),
  handler: async (ctx, { eventIds }) =>
    Promise.all(
      eventIds.map(async (eventId) => {
        const rows = await ctx.db
          .query("attendance")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .take(MAX_EVENTS);
        return { eventId, keys: [...new Set(rows.map(personKey).filter((k) => k))] };
      })
    ),
});

const personInfo = v.object({ campus: v.union(v.string(), v.null()), roles: v.array(v.string()) });
const personValidator = v.object({
  key: v.string(),
  name: v.string(),
  photo: v.optional(v.union(v.string(), v.null())),
  memberId: v.optional(v.union(v.string(), v.null())),
  infoByYear: v.record(v.string(), personInfo),
  info: personInfo,
});

async function resolvePeople(ctx: QueryCtx, keys: string[], years: number[]): Promise<WeeklyPerson[]> {
  const profilesByYear = new Map<number, Map<string, Doc<"staffProfiles">>>();
  {
    for (const year of years) {
      const profiles = await ctx.db
        .query("staffProfiles")
        .withIndex("by_year", (q) => q.eq("year", year))
        .take(MAX_PROFILES_PER_YEAR);
      profilesByYear.set(year, new Map(profiles.map((p) => [p.email.toLowerCase(), p])));
    }
  }
  const fields = await ctx.db.query("attendanceMetadata").take(200);
  const campusField = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
  const fieldLabel = (field: Doc<"attendanceMetadata"> | undefined, member: Doc<"attendanceMembers"> | null) => {
    const raw = field ? member?.metadata?.[field._id] : undefined;
    return raw ? (field?.values?.[raw] ?? raw) : null;
  };
  const memberInfo = (member: Doc<"attendanceMembers"> | null) => {
    const campus = fieldLabel(campusField, member);
    const role = fieldLabel(roleField, member);
    return { campus: campus && campus !== "Other" ? campus : null, roles: role ? [role] : [] };
  };

  const people: WeeklyPerson[] = [];
  for (const key of keys) {
    let member: Doc<"attendanceMembers"> | null;
    let email: string | undefined;
    if (key.startsWith("member:")) {
      const id = ctx.db.normalizeId("attendanceMembers", key.slice("member:".length));
      member = id ? await ctx.db.get("attendanceMembers", id) : null;
      // Staff signed in through their member row still have a staff profile.
      email = member?.email ? canonicalEmailKey(member.email) : undefined;
    } else {
      email = key.slice("staff:".length);
      const staffEmail = email;
      member = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_email", (q) => q.eq("email", staffEmail))
        .first();
    }
    const fallback = memberInfo(member);
    const infoByYear: WeeklyPerson["infoByYear"] = {};
    let latest: Doc<"staffProfiles"> | undefined;
    for (const year of email ? years : []) {
      const byEmail = profilesByYear.get(year)!;
      const profile = staffEmailCandidates(email!)
        .map((candidate) => byEmail.get(candidate))
        .find((p) => p);
      if (!profile) continue;
      latest = profile;
      const assignments = assignmentsOf(profile);
      const roles = [...new Set(assignments.map((a) => a.role))];
      const university = assignments.find((a) => a.university && roleNeedsUniversity(a.role))?.university;
      infoByYear[String(year)] = {
        campus: university ?? fallback.campus,
        roles: roles.length ? roles : fallback.roles,
      };
    }
    const user = latest?.userId ? await ctx.db.get("users", latest.userId) : null;
    people.push({
      key,
      name: personDisplayName(latest?.name ?? member?.name, email) || "Unknown",
      photo: user?.image ?? null,
      memberId: member?._id ?? null,
      infoByYear,
      info: fallback,
    });
  }
  return people;
}

export const gatherPeople = internalQuery({
  args: { keys: v.array(v.string()), years: v.array(v.number()) },
  returns: v.array(personValidator),
  handler: (ctx, { keys, years }) => resolvePeople(ctx, keys, years),
});

export const saveFacts = internalMutation({
  args: {
    subgroup: v.string(),
    upsert: v.array(v.object(termFactsFields)),
    remove: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { subgroup, upsert, remove }) => {
    for (const termKey of [...remove, ...upsert.map((f) => f.termKey)]) {
      const existing = await ctx.db
        .query("weeklyTermFacts")
        .withIndex("by_subgroup_and_termKey", (q) => q.eq("subgroup", subgroup).eq("termKey", termKey))
        .unique();
      if (existing) await ctx.db.delete("weeklyTermFacts", existing._id);
    }
    for (const facts of upsert) await ctx.db.insert("weeklyTermFacts", facts);
    return null;
  },
});

export const saveView = internalMutation({
  args: {
    subgroup: v.string(),
    periodKey: v.string(),
    computedAt: v.number(),
    blocks: v.array(weeklyBlockValidator),
  },
  returns: v.null(),
  handler: async (ctx, row) => {
    const existing = await ctx.db
      .query("weeklyInsightViews")
      .withIndex("by_subgroup_and_periodKey", (q) =>
        q.eq("subgroup", row.subgroup).eq("periodKey", row.periodKey)
      )
      .unique();
    if (existing) await ctx.db.replace("weeklyInsightViews", existing._id, row);
    else await ctx.db.insert("weeklyInsightViews", row);
    return null;
  },
});

const indexFields = {
  subgroup: v.string(),
  computedAt: v.number(),
  periods: v.array(v.object({ key: v.string(), label: v.string() })),
  currentKey: v.union(v.string(), v.null()),
  weeklies: v.array(v.object({ at: v.number(), count: v.number(), joint: v.boolean() })),
  settingsVersion: v.number(),
  viewVersion: v.number(),
  auditSeen: v.number(),
  eventsSeen: v.number(),
  nextCompareAt: v.number(),
};

/** Writes the campus's index row and drops views for periods that are gone. */
export const saveIndex = internalMutation({
  args: indexFields,
  returns: v.null(),
  handler: async (ctx, row) => {
    const existing = await indexFor(ctx, row.subgroup);
    if (existing) await ctx.db.replace("weeklyInsightIndex", existing._id, row);
    else await ctx.db.insert("weeklyInsightIndex", row);
    const keep = new Set(row.periods.map((p) => p.key));
    const views = await ctx.db
      .query("weeklyInsightViews")
      .withIndex("by_subgroup_and_periodKey", (q) => q.eq("subgroup", row.subgroup))
      .take(MAX_TERMS);
    for (const view of views) {
      if (!keep.has(view.periodKey)) await ctx.db.delete("weeklyInsightViews", view._id);
    }
    return null;
  },
});

/** Nothing to rebuild: just remember how far through the change log we are. */
export const saveWatermark = internalMutation({
  args: { subgroup: v.string(), auditSeen: v.number(), eventsSeen: v.number() },
  returns: v.null(),
  handler: async (ctx, { subgroup, auditSeen, eventsSeen }) => {
    const index = await indexFor(ctx, subgroup);
    if (index) await ctx.db.patch("weeklyInsightIndex", index._id, { auditSeen, eventsSeen });
    return null;
  },
});

const sameFacts = (a: TermFacts, b: FactsDoc | undefined): boolean => {
  if (!b) return false;
  const weekly = (w: TermFacts["weeklies"]) => w.map((x) => `${x.eventId}@${x.at}#${x.week}=${x.count}`).join("|");
  const people = (entries: [string, number[]][]) =>
    entries
      .map(([key, indexes]) => `${key}:${indexes.join(",")}`)
      .sort()
      .join("|");
  return (
    weekly(a.weeklies) === weekly(b.weeklies) &&
    people(Object.entries(a.attendance)) === people(b.attendance.map((x) => [x.key, x.indexes]))
  );
};

/** The same day a year earlier, for year-to-date comparisons. */
export const yearBefore = (ms: number): number => {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.getTime();
};

const yearAfter = (ms: number): number => {
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.getTime();
};

const termYears = (facts: TermFacts[]) => [
  ...new Set(facts.map((f) => eventStaffYear(f.weeklies[f.weeklies.length - 1].at))),
];

async function buildSubgroup(
  ctx: ActionCtx,
  subgroup: string,
  check: {
    settings: WeeklySettings;
    version: number;
    hasIndex: boolean;
    settingsChanged: boolean;
    eventIds: Id<"events">[];
    memberKeys: string[];
    goneMemberKeys: string[];
    tagChanged: boolean;
    compareDue: boolean;
    auditMax: number;
    eventsMax: number;
  },
  now: number,
  force: boolean
): Promise<void> {
  const { settings } = check;
  const weeklyEvents: {
    eventId: Id<"events">;
    at: number;
    joint: boolean;
    name: string;
    mark: WeeklyMark | null;
  }[] = [];
  for (let cursor: string | null = null, done = false; !done; ) {
    const page: { page: typeof weeklyEvents; isDone: boolean; continueCursor: string } =
      await ctx.runQuery(internal.weeklyInsights.weeklyEventsPage, {
        subgroup,
        now,
        includeJoint: settings.jointWeeklies,
        paginationOpts: { numItems: EVENTS_PAGE, cursor },
      });
    weeklyEvents.push(...page.page);
    done = page.isDone;
    cursor = page.continueCursor;
  }
  const data = {
    weeklyEvents,
    facts: await ctx.runQuery(internal.weeklyInsights.loadFactsDocs, { subgroup }),
  };
  const stored = new Map(data.facts.map((f) => [f.termKey, f]));

  // Who came to each weekly, from the stored facts where they're still good.
  const keysByEvent = new Map<string, string[]>();
  for (const doc of data.facts) {
    doc.weeklies.forEach((w) => keysByEvent.set(w.eventId, []));
    for (const { key, indexes } of doc.attendance) {
      for (const i of indexes) keysByEvent.get(doc.weeklies[i].eventId)!.push(key);
    }
  }
  const gone = new Set(check.goneMemberKeys);
  const regather = new Set<string>(check.eventIds);
  for (const [eventId, keys] of keysByEvent) {
    if (keys.some((k) => gone.has(k))) regather.add(eventId);
  }
  const full = !check.hasIndex || check.tagChanged;
  const toGather = data.weeklyEvents
    .filter((e) => full || regather.has(e.eventId) || !keysByEvent.has(e.eventId))
    .map((e) => e.eventId);
  for (let i = 0; i < toGather.length; i += GATHER_CHUNK) {
    const rows = await ctx.runQuery(internal.weeklyInsights.attendanceFor, {
      eventIds: toGather.slice(i, i + GATHER_CHUNK),
    });
    for (const row of rows) keysByEvent.set(row.eventId, row.keys);
  }

  const held: HeldWeekly[] = data.weeklyEvents
    .filter((e) => (keysByEvent.get(e.eventId)?.length ?? 0) > 0)
    .map((e) => ({
      eventId: e.eventId,
      at: e.at,
      count: keysByEvent.get(e.eventId)!.length,
      name: e.name,
      mark: e.mark,
    }))
    .sort((a, b) => a.at - b.at);
  const terms = deriveTerms(held, termSystemFor(subgroup, settings), settings.termGapDays);
  const facts: TermFacts[] = terms.map((t) => {
    const attendance: Record<string, number[]> = {};
    t.weeklies.forEach((w, i) => {
      for (const key of keysByEvent.get(w.eventId)!) (attendance[key] ??= []).push(i);
    });
    return { ...t, attendance };
  });
  const changed = facts.map((f, i) => (sameFacts(f, stored.get(f.key)) ? -1 : i)).filter((i) => i >= 0);
  const removed = [...stored.keys()].filter((key) => !facts.some((f) => f.key === key));

  // Which views to redo: every term from the one before the first change
  // (so a term that just finished loses "so far" and its follow-ups), the
  // latest term if someone in it was edited, or everything on a settings
  // change.
  const latest = facts.length - 1;
  const recompute = new Set<number>();
  if (force || check.settingsChanged) facts.forEach((_, i) => recompute.add(i));
  if (changed.length) {
    for (let i = Math.max(0, Math.min(...changed) - 1); i <= latest; i++) recompute.add(i);
  }
  const edited = new Set(check.memberKeys);
  const touches = (f: TermFacts | undefined) => !!f && Object.keys(f.attendance).some((k) => edited.has(k));
  if (latest >= 0 && (touches(facts[latest]) || touches(facts[latest - 1]))) recompute.add(latest);
  // A due date passed: last year's comparison moved on, or the latest term
  // stopped running (no more "so far", no follow-ups once it's over).
  if (latest >= 0 && check.compareDue) recompute.add(latest);

  const thisYear = sydneyCalendarYear(new Date(now));
  const years = new Set<number>([...recompute].map((i) => facts[i].year));
  if (check.compareDue) years.add(thisYear);
  // A year compares with the one before, so redo the years after a change.
  if (years.size) for (let y = Math.min(...years); y <= thisYear; y++) years.add(y);
  for (const y of [...years]) if (!facts.some((f) => f.year === y)) years.delete(y);

  // People needed: everyone in the terms being redone and those they're
  // compared with.
  const need = new Set<number>();
  const add = (i: number) => {
    if (i < 0) return;
    need.add(i);
    if (i > 0) need.add(i - 1);
  };
  for (const i of recompute) {
    add(i);
    add(facts.findIndex((f) => f.year === facts[i].year - 1 && f.slot === facts[i].slot));
  }
  facts.forEach((f, i) => {
    if (years.has(f.year) || years.has(f.year + 1)) add(i);
  });
  const keys = [...new Set([...need].flatMap((i) => Object.keys(facts[i].attendance)))];
  const people: WeeklyPerson[] = [];
  const staffYears = termYears([...need].map((i) => facts[i]));
  for (let i = 0; i < keys.length; i += PEOPLE_CHUNK) {
    people.push(
      ...(await ctx.runQuery(internal.weeklyInsights.gatherPeople, {
        keys: keys.slice(i, i + PEOPLE_CHUNK),
        years: staffYears,
      }))
    );
  }
  const c = { subgroup, settings, persons: new Map(people.map((p) => [p.key, p])) };

  if (changed.length || removed.length) {
    await ctx.runMutation(internal.weeklyInsights.saveFacts, {
      subgroup,
      upsert: changed.map((i) => {
        const f = facts[i];
        return {
          subgroup,
          termKey: f.key,
          label: f.label,
          year: f.year,
          slot: f.slot,
          system: f.system,
          weeklies: f.weeklies.map((w) => ({ ...w, eventId: w.eventId as Id<"events"> })),
          attendance: Object.entries(f.attendance).map(([key, indexes]) => ({ key, indexes })),
        };
      }),
      remove: removed,
    });
  }

  for (const i of [...recompute].sort((a, b) => a - b)) {
    const lastAt = facts[i].weeklies[facts[i].weeklies.length - 1].at;
    const running = i === latest && now - lastAt < settings.termGapDays * DAY_MS;
    const result = computeTerm(facts, i, c);
    const blocks = buildTermBlocks({
      computedAt: now,
      result,
      lastYear: sameTermLastYear(facts, i, running, c),
      running,
      followUps: i === latest ? followUps(facts, result.rows, c) : null,
    });
    await ctx.runMutation(internal.weeklyInsights.saveView, {
      subgroup,
      periodKey: facts[i].key,
      computedAt: now,
      blocks,
    });
  }
  for (const year of [...years].sort()) {
    const upTo = year === thisYear ? yearBefore(now) : undefined;
    const result = computeYear(facts, year, c)!;
    const inYear = (y: number) =>
      facts.map((f, i) => (f.year === y ? computeTerm(facts, i, c) : null)).filter((r) => r !== null);
    const blocks = buildYearBlocks({
      computedAt: now,
      result,
      lastYear: computeYear(facts, year - 1, c, upTo),
      upTo: upTo ?? null,
      terms: inYear(year),
      lastYearTerms: inYear(year - 1),
    });
    await ctx.runMutation(internal.weeklyInsights.saveView, {
      subgroup,
      periodKey: String(year),
      computedAt: now,
      blocks,
    });
  }

  const runningUntil =
    latest >= 0
      ? facts[latest].weeklies[facts[latest].weeklies.length - 1].at + settings.termGapDays * DAY_MS
      : 0;
  const nextCompareAt = Math.min(
    NEVER,
    ...(runningUntil > now ? [runningUntil] : []),
    ...facts
      .filter((f) => f.year === thisYear - 1)
      .flatMap((f) => f.weeklies.map((w) => yearAfter(w.at)))
      .filter((at) => at > now)
  );
  const factYears = [...new Set(facts.map((f) => f.year))].sort((a, b) => b - a);
  const recentFrom = now - INDEX_WEEKLIES_WEEKS * WEEK_MS;
  const joint = new Map(data.weeklyEvents.map((e) => [e.eventId, e.joint]));
  await ctx.runMutation(internal.weeklyInsights.saveIndex, {
    subgroup,
    computedAt: now,
    periods: [
      ...[...facts].reverse().map((f) => ({ key: f.key, label: f.label })),
      ...factYears.map((y) => ({ key: String(y), label: `${y} · whole year` })),
    ],
    currentKey: latest >= 0 ? facts[latest].key : null,
    weeklies: held
      .filter((w) => w.at >= recentFrom)
      .map((w) => ({ at: w.at, count: w.count, joint: joint.get(w.eventId as Id<"events">)! })),
    settingsVersion: check.version,
    viewVersion: VIEW_VERSION,
    auditSeen: check.auditMax,
    eventsSeen: check.eventsMax,
    nextCompareAt,
  });
}

/** Rebuilds one campus, doing only what changed since its last build. */
export const rebuild = internalAction({
  args: { subgroup: v.string(), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { subgroup, force = false }) => {
    const now = Date.now();
    const canonical = canonicalSubgroup(subgroup);
    const check = await ctx.runQuery(internal.weeklyInsights.checkChanges, { subgroup: canonical, now });
    if (!force && !check.needsBuild) {
      await ctx.runMutation(internal.weeklyInsights.saveWatermark, {
        subgroup: canonical,
        auditSeen: check.auditMax,
        eventsSeen: check.eventsMax,
      });
      return null;
    }
    await buildSubgroup(ctx, canonical, check, now, force);
    return null;
  },
});

/** The nightly build: every campus with a university row this staff year. */
export const rebuildAll = internalMutation({
  args: { force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { force }) => {
    const universities = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", currentStaffYear()))
      .take(100);
    for (const uni of universities) {
      if (isOrgWideSubgroup(uni.name)) continue;
      await ctx.scheduler.runAfter(0, internal.weeklyInsights.rebuild, {
        subgroup: uni.name,
        force,
      });
    }
    return null;
  },
});

/**
 * Changes the numbers Insights uses, e.g.
 * `npx convex run weeklyInsights:setSettings '{"regularShare":0.4}'`.
 * Every campus is rebuilt from its stored facts straight away.
 */
export const setSettings = internalMutation({
  args: {
    regularShare: v.optional(v.number()),
    termGapDays: v.optional(v.number()),
    carryOverWeeklies: v.optional(v.number()),
    followUpMisses: v.optional(v.number()),
    newcomerMisses: v.optional(v.number()),
    freshWeeklies: v.optional(v.number()),
    newcomerPromoteWeeklies: v.optional(v.number()),
    visitorMinWeeklies: v.optional(v.number()),
    termCampuses: v.optional(v.array(v.string())),
    jointWeeklies: v.optional(v.boolean()),
    staffRoles: v.optional(v.array(v.string())),
    leaderRoles: v.optional(v.array(v.string())),
  },
  returns: settingsValidator,
  handler: async (ctx, changes) => {
    const { settings, version, id } = await readSettings(ctx);
    const next: WeeklySettings = { ...settings };
    for (const [k, val] of Object.entries(changes)) {
      if (val !== undefined) Object.assign(next, { [k]: val });
    }
    if (id) await ctx.db.replace("weeklyInsightsSettings", id, { ...next, version: version + 1 });
    else await ctx.db.insert("weeklyInsightsSettings", { ...next, version: version + 1 });
    await ctx.scheduler.runAfter(0, internal.weeklyInsights.rebuildAll, {});
    return next;
  },
});

/**
 * One-off: the Role option "Visitor" becomes "Guest", so Visitor can mean
 * someone visiting from another campus. Everyone tagged keeps the tag.
 */
export const renameVisitorRole = internalMutation({
  args: {},
  returns: v.object({ renamed: v.boolean() }),
  handler: async (ctx) => {
    const fields = await ctx.db.query("attendanceMetadata").take(200);
    const role = fields.find((f) => f.key === ROLE_FIELD_KEY);
    const entry = Object.entries(role?.values ?? {}).find(([, label]) => label === "Visitor");
    if (!role || !entry) return { renamed: false };
    await ctx.db.patch("attendanceMetadata", role._id, {
      values: { ...role.values, [entry[0]]: "Guest" },
    });
    return { renamed: true };
  },
});

/** A campus's weeklies as Insights sees them: one campus, tagged Weekly
 *  Meeting or created as a Weekly (joint ones only if the setting allows). */
async function campusWeeklies(
  ctx: QueryCtx,
  subgroup: string,
  settings: WeeklySettings,
  except?: Id<"events">
): Promise<HeldWeekly[]> {
  const weekly = await weeklyTagIds(ctx);
  const events = await ctx.db.query("events").withIndex("by_dateStart").take(MAX_EVENTS);
  return events
    .filter(
      (e) =>
        e._id !== except &&
        eventIncludesSubgroup(e.subgroups, subgroup) &&
        (!!e.weekly || (e.tagIds ?? []).some((id) => weekly.has(id))) &&
        (settings.jointWeeklies || normalizeSubgroups(e.subgroups).length === 1)
    )
    .map((e) => ({ eventId: e._id, at: e.dateStart, count: 1, name: e.name, mark: e.weekly ?? null }));
}

const markOption = v.object({ key: v.string(), label: v.string(), year: v.number(), slot: v.number() });

/** What the New event form pre-fills for a Weekly on a date: its term (and
 *  the terms to choose from), week and name. `eventId` leaves an event being
 *  edited out of its own suggestion. */
export const suggestWeekly = query({
  args: { subgroup: v.string(), dateStart: v.number(), eventId: v.optional(v.id("events")) },
  returns: v.union(
    v.null(),
    v.object({
      system: v.union(v.literal("terms"), v.literal("semesters")),
      options: v.array(markOption),
      suggested: v.object({ key: v.string(), year: v.number(), slot: v.number(), week: v.number() }),
      name: v.string(),
    })
  ),
  handler: async (ctx, { subgroup, dateStart, eventId }) => {
    if (!(await optionalProfile(ctx))) return null;
    const canonical = canonicalSubgroup(subgroup);
    const { settings } = await readSettings(ctx);
    const system = termSystemFor(canonical, settings);
    const s = suggestFrom(
      await campusWeeklies(ctx, canonical, settings, eventId),
      dateStart,
      system,
      settings.termGapDays
    );
    // The form adds the suggested term if it isn't one of these.
    const options = termOptions(system, sydneyCalendarYear(new Date(dateStart)));
    return {
      system,
      options,
      suggested: { key: s.key, year: s.year, slot: s.slot, week: s.week },
      name: weeklyName(system, s.slot, s.week),
    };
  },
});

/**
 * One-off: gives every campus weekly its term and week, the way Insights
 * works them out (names first, then dates), and tags the ones that look like
 * weeklies by name but were never tagged. Combined and Mega weeklies (more
 * than one campus) are left alone. Then rebuilds Insights.
 * `npx convex run weeklyInsights:backfillWeeklies '{"dryRun": true}'`
 */
export const backfillWeeklies = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    marked: v.number(),
    tagged: v.number(),
    byCampus: v.array(v.object({ campus: v.string(), terms: v.array(v.string()) })),
  }),
  handler: async (ctx, { dryRun = false }) => {
    const { settings } = await readSettings(ctx);
    const weeklyTags = await weeklyTagIds(ctx);
    let tag = [...weeklyTags][0];
    const events = await ctx.db.query("events").withIndex("by_dateStart").take(MAX_EVENTS);
    const single = events.filter(
      (e) => normalizeSubgroups(e.subgroups).length === 1 && !isOrgWideSubgroup(e.subgroups[0])
    );
    const isWeekly = (e: Doc<"events">) =>
      !!e.weekly || (e.tagIds ?? []).some((id) => weeklyTags.has(id)) || looksWeekly(e.name);
    let marked = 0;
    let tagged = 0;
    const byCampus: { campus: string; terms: string[] }[] = [];
    for (const campus of [...new Set(single.map((e) => canonicalSubgroup(e.subgroups[0])))].sort()) {
      const mine = single.filter((e) => canonicalSubgroup(e.subgroups[0]) === campus && isWeekly(e));
      const system = termSystemFor(campus, settings);
      const terms = deriveTerms(
        mine.map((e) => ({ eventId: e._id, at: e.dateStart, count: 1, name: e.name, mark: e.weekly ?? null })),
        system,
        settings.termGapDays
      );
      byCampus.push({
        campus,
        terms: terms.map((t) => `${t.label}: ${t.weeklies.map((w) => `W${w.week}`).join(" ")}`),
      });
      for (const t of terms) {
        for (const w of t.weeklies) {
          const event = mine.find((e) => e._id === w.eventId)!;
          const hasTag = (event.tagIds ?? []).some((id) => weeklyTags.has(id));
          if (!hasTag) tagged += 1;
          if (!event.weekly) marked += 1;
          if (dryRun || (event.weekly && hasTag)) continue;
          if (!tag) tag = await ctx.db.insert("attendanceTags", { name: WEEKLY_MEETING_TAG_NAME });
          await ctx.db.patch("events", event._id, {
            weekly: event.weekly ?? { year: t.year, slot: t.slot, week: w.week },
            tagIds: hasTag ? event.tagIds : [...(event.tagIds ?? []), tag],
          });
        }
      }
    }
    if (!dryRun) await ctx.scheduler.runAfter(0, internal.weeklyInsights.rebuildAll, { force: true });
    return { marked, tagged, byCampus };
  },
});

// ---------------------------------------------------------------------------
// Reading

const NOT_READY: ViewBlock = {
  type: "empty",
  icon: "sparkles-outline",
  title: "Not ready yet",
  message: "Insights rebuild overnight.",
};

const NO_WEEKLIES: ViewBlock = {
  type: "empty",
  icon: "calendar-outline",
  title: "No weekly meetings yet",
  message: "Tag a campus's weekly meetings with Weekly Meeting to see them here.",
};

const periodValidator = v.object({ key: v.string(), label: v.string() });

/** A campus's Insights view for a term or year (its current term by default). */
export const view = query({
  args: { subgroup: v.string(), period: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({
      periods: v.array(periodValidator),
      period: v.union(v.string(), v.null()),
      blocks: v.array(weeklyBlockValidator),
    })
  ),
  handler: async (ctx, { subgroup, period }) => {
    if (!(await optionalProfile(ctx))) return null;
    const canonical = canonicalSubgroup(subgroup);
    const index = await indexFor(ctx, canonical);
    if (!index) return { periods: [], period: null, blocks: [NOT_READY] };
    const key =
      period && index.periods.some((p) => p.key === period) ? period : index.currentKey;
    if (!key) return { periods: index.periods, period: null, blocks: [NO_WEEKLIES] };
    const row = await ctx.db
      .query("weeklyInsightViews")
      .withIndex("by_subgroup_and_periodKey", (q) => q.eq("subgroup", canonical).eq("periodKey", key))
      .unique();
    return { periods: index.periods, period: key, blocks: row?.blocks ?? [NOT_READY] };
  },
});

async function eventsAttended(ctx: QueryCtx, key: string): Promise<MemberEvent[]> {
  let rows: Doc<"attendance">[];
  if (key.startsWith("member:")) {
    const id = ctx.db.normalizeId("attendanceMembers", key.slice("member:".length));
    rows = id
      ? await ctx.db
          .query("attendance")
          .withIndex("by_member", (q) => q.eq("memberId", id))
          .take(MAX_MEMBER_EVENTS)
      : [];
  } else {
    rows = [];
    for (const email of staffEmailCandidates(key.slice("staff:".length))) {
      rows.push(
        ...(await ctx.db
          .query("attendance")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(MAX_MEMBER_EVENTS))
      );
    }
  }
  const weekly = await weeklyTagIds(ctx);
  const seen = new Set<string>();
  const events: MemberEvent[] = [];
  for (const row of rows) {
    if (seen.has(row.eventId)) continue;
    seen.add(row.eventId);
    const event = await ctx.db.get("events", row.eventId);
    if (!event) continue;
    events.push({
      name: event.name,
      at: event.dateStart,
      campuses: normalizeSubgroups(event.subgroups).map(subgroupLabel).join(" · "),
      weekly: (event.tagIds ?? []).some((id) => weekly.has(id)),
    });
  }
  return events.sort((a, b) => b.at - a.at);
}

/** One person's page: details, their weeklies at this campus, and every event. */
export const member = query({
  args: { personKey: v.string(), subgroup: v.string() },
  returns: v.union(v.null(), v.object({ title: v.string(), blocks: v.array(weeklyBlockValidator) })),
  handler: async (ctx, { personKey: key, subgroup }) => {
    if (!(await optionalProfile(ctx))) return null;
    const canonical = canonicalSubgroup(subgroup);
    const { settings } = await readSettings(ctx);
    const facts = await loadFacts(ctx, canonical);
    const [person] = await resolvePeople(ctx, [key], termYears(facts));
    const c = { subgroup: canonical, settings, persons: new Map([[key, person]]) };

    const history: { term: TermFacts; row: ReturnType<typeof termRows>[number] }[] = [];
    let followUp: ReturnType<typeof followUps>[number] | null = null;
    for (let i = 0; i < facts.length; i++) {
      const listed = key in facts[i].attendance || (i > 0 && key in facts[i - 1].attendance);
      if (!listed) continue;
      const rows = termRows(facts, i, c);
      history.unshift({ term: facts[i], row: rows.find((r) => r.key === key)! });
      if (i === facts.length - 1) followUp = followUps(facts, rows, c).find((f) => f.key === key) ?? null;
    }

    const memberDoc = person.memberId
      ? await ctx.db.get("attendanceMembers", person.memberId as Id<"attendanceMembers">)
      : null;
    const fields = (await ctx.db.query("attendanceMetadata").take(200)).sort((a, b) => a.order - b.order);
    const details: { label: string; value: string }[] = [];
    const email = memberDoc?.email ?? (key.startsWith("staff:") ? key.slice("staff:".length) : undefined);
    if (email) details.push({ label: "Email", value: email });
    for (const field of fields) {
      if (field.key === CAMPUS_FIELD_KEY || field.key === ROLE_FIELD_KEY) continue;
      const raw = memberDoc?.metadata?.[field._id];
      if (raw) details.push({ label: field.key, value: field.values?.[raw] ?? raw });
    }
    const now = Date.now();
    const info = person.infoByYear[String(eventStaffYear(now))] ?? person.info;
    const lines = [
      info.campus ? subgroupLabel(info.campus) : "No campus set",
      ...(info.roles.length ? [info.roles.join(" · ")] : []),
    ];
    return {
      title: person.name,
      blocks: buildMemberBlocks({
        name: person.name,
        photo: person.photo,
        memberId: person.memberId,
        lines,
        details,
        history,
        followUp,
        events: await eventsAttended(ctx, key),
        year: sydneyCalendarYear(new Date(now)),
      }),
    };
  },
});

/** Each campus's average weekly head count over a range, highest first, for
 *  the SOW view. */
export async function readCampusWeeklyAverages(
  ctx: QueryCtx,
  year: number,
  rangeWeeks: number,
  includeCollaborative: boolean
): Promise<{ campus: string; avgWeekly: number }[]> {
  const universities = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", year))
    .take(100);
  const from = rangeStartFor(Date.now(), rangeWeeks, staffYearStartMs(year));
  const out: { campus: string; avgWeekly: number }[] = [];
  for (const uni of universities) {
    const index = await indexFor(ctx, canonicalSubgroup(uni.name));
    const weeklies = (index?.weeklies ?? []).filter(
      (w) => w.at >= from && (includeCollaborative || !w.joint)
    );
    if (!weeklies.length) continue;
    const avg = weeklies.reduce((s, w) => s + w.count, 0) / weeklies.length;
    out.push({ campus: uni.name, avgWeekly: Math.round(avg * 10) / 10 });
  }
  return out.sort((a, b) => b.avgWeekly - a.avgWeekly);
}
