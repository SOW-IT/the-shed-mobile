import { v } from "convex/values";
import { sydneyYmd } from "../shared/flow";
import {
  isOrgWideSubgroup,
  isWeekliesTagName,
  normalizeSubgroups,
  tagListOf,
  WEEKLIES_TAG_NAME,
  type TagList,
} from "../shared/rollcall";
import {
  markFromName,
  suggestWeekly,
  termSystemFor,
  weeklyName,
  type HeldWeekly,
  type WeeklyMark,
} from "../shared/weeklyInsights";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { readSettings } from "./weeklyInsights";

const ACTOR = "it@sow.org.au";
const MAX_EVENTS = 5000;

type TagSpec = { name: string; list: TagList; colour?: string; subgroups?: string[] };

const WEEKLY_LABELS: (TagSpec & { pattern: RegExp })[] = [
  { name: "PPN", list: "weeklies", colour: "emerald", pattern: /\bPPN\b/i },
  { name: "BAM", list: "weeklies", colour: "orange", pattern: /\bBAM\b/i },
  { name: "Games Night", list: "weeklies", colour: "cyan", pattern: /\bGAMES?\s*NIGHT\b/i },
  { name: "Mega", list: "weeklies", colour: "purple", pattern: /\bMEGA\b/i },
  { name: "Grad", list: "weeklies", colour: "yellow", pattern: /\bGRAD\b/i },
];

const EVENT_NAME_TAGS: { name: string; pattern: RegExp }[] = [
  { name: "TWIG", pattern: /\bTWIG\b/i },
  { name: "PPN", pattern: /\bPPN\b/i },
  { name: "Seasons", pattern: /\bSEASONS?\b/i },
];

const MERGE_INTO_SOCIAL = ["Event", "Other Events"];
const OPEN_TO_EVERY_CAMPUS = ["Social", "Mid-Sem Break", "Retreat", "PPN"];

const NOISE = [
  /\b[TS]\s?\d\s?W(?:EEK)?\s?\d{1,2}\b/gi,
  /\bW[MK]?\s?#\s?\d{1,2}\b/gi,
  /\bWEEK\s?\d{1,2}\b/gi,
  /\bWEEK(?:LIES|LY|ILES|LYS)?\b/gi,
  /\b[TS]\d\b/gi,
  /\b(?:UNSW|USYD|UTS|MQ|MACQ|SOW|COMBINED|X|AND)\b/gi,
  /\b(?:UTS|USYD|UNSW|MQ|SOW)(?:X?(?:UTS|USYD|UNSW|MQ|SOW))+\b/gi,
  /\b20\d\d\b/g,
  /\bNIGHT\b/gi,
];

export const leftoverWords = (name: string): string => {
  let rest = name;
  for (const label of WEEKLY_LABELS) rest = rest.replace(label.pattern, " ");
  for (const pattern of NOISE) rest = rest.replace(pattern, " ");
  return rest.replace(/[^A-Za-z0-9']+/g, " ").trim();
};

type EventChange = {
  eventId: Id<"events">;
  date: string;
  subgroups: string[];
  kind: "weekly" | "event";
  before: { name: string; tags: string[]; mark: WeeklyMark | null };
  after: { name: string; tags: string[]; mark: WeeklyMark | null };
  unmapped?: string;
};

const dateOf = (ms: number) => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

async function planTags(ctx: MutationCtx, apply: boolean) {
  const rows = await ctx.db.query("attendanceTags").take(500);
  const changes: string[] = [];
  const byKey = new Map<string, Doc<"attendanceTags">>();
  for (const row of rows) byKey.set(`${tagListOf(row)}:${row.name.toLowerCase()}`, row);
  const placeholder = (key: string) => `new:${key}` as Id<"attendanceTags">;

  const weeklies = rows.find((r) => r.name === WEEKLIES_TAG_NAME) ?? rows.find((r) => isWeekliesTagName(r.name));
  if (weeklies && weeklies.name !== WEEKLIES_TAG_NAME) {
    changes.push(`Rename "${weeklies.name}" to "${WEEKLIES_TAG_NAME}"`);
    if (apply) await ctx.db.patch("attendanceTags", weeklies._id, { name: WEEKLIES_TAG_NAME });
  }
  let weekliesId = weeklies?._id ?? placeholder("weeklies-tag");
  if (!weeklies) {
    changes.push(`Create "${WEEKLIES_TAG_NAME}"`);
    if (apply) weekliesId = await ctx.db.insert("attendanceTags", { name: WEEKLIES_TAG_NAME, colour: "amber" });
  }

  const social = byKey.get("events:social");
  const merged = MERGE_INTO_SOCIAL.map((name) => byKey.get(`events:${name.toLowerCase()}`)).filter(
    (row): row is Doc<"attendanceTags"> => !!row
  );
  for (const row of merged) changes.push(`Merge "${row.name}" into "Social" and delete it`);

  for (const row of rows) {
    if (isWeekliesTagName(row.name) || merged.includes(row)) continue;
    const patch: Partial<Doc<"attendanceTags">> = {};
    if (!row.list) patch.list = "events";
    if (OPEN_TO_EVERY_CAMPUS.includes(row.name) && row.subgroups?.length) {
      patch.subgroups = undefined;
      changes.push(`"${row.name}": available to every campus and SOW (was ${row.subgroups.join(", ")})`);
    }
    if (Object.keys(patch).length && apply) await ctx.db.patch("attendanceTags", row._id, patch);
  }

  let socialId = social?._id ?? null;
  if (!social && merged.length) {
    changes.push(`Create "Social" (Other events)`);
    socialId = apply
      ? await ctx.db.insert("attendanceTags", { name: "Social", list: "events", colour: "emerald" })
      : placeholder("social");
  }

  const weeklyLabelIds = new Map<string, Id<"attendanceTags">>();
  for (const spec of WEEKLY_LABELS) {
    const existing = byKey.get(`weeklies:${spec.name.toLowerCase()}`);
    if (existing) {
      weeklyLabelIds.set(spec.name, existing._id);
      continue;
    }
    changes.push(`Create "${spec.name}" (Weeklies)`);
    weeklyLabelIds.set(
      spec.name,
      apply
        ? await ctx.db.insert("attendanceTags", { name: spec.name, list: "weeklies", colour: spec.colour })
        : placeholder(`weeklies:${spec.name}`)
    );
  }

  const eventTagIds = new Map<string, Id<"attendanceTags">>();
  for (const spec of EVENT_NAME_TAGS) {
    const existing = byKey.get(`events:${spec.name.toLowerCase()}`);
    if (existing) eventTagIds.set(spec.name, existing._id);
  }

  return {
    changes,
    weekliesId,
    socialId,
    mergedIds: new Set(merged.map((row) => row._id)),
    weeklyLabelIds,
    eventTagIds,
    names: new Map<Id<"attendanceTags">, string>([
      ...rows.map((r) => [r._id, isWeekliesTagName(r.name) ? WEEKLIES_TAG_NAME : r.name] as const),
      ...[...weeklyLabelIds].map(([name, id]) => [id, `${name} (weekly)`] as const),
      ...(socialId ? [[socialId, "Social"] as const] : []),
      [weekliesId, WEEKLIES_TAG_NAME] as const,
    ]),
    rows,
  };
}

const ownerCampus = (subgroups: string[]): string | null =>
  normalizeSubgroups(subgroups).find((s) => !isOrgWideSubgroup(s)) ?? null;

export const run = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun = true }) => {
    const apply = !dryRun;
    const tags = await planTags(ctx, apply);
    const { settings } = await readSettings(ctx);
    const weekliesIds = new Set(tags.rows.filter((r) => isWeekliesTagName(r.name)).map((r) => r._id));
    const eventsPpn = tags.eventTagIds.get("PPN");
    const twig = tags.eventTagIds.get("TWIG");
    const events = await ctx.db.query("events").withIndex("by_dateStart").take(MAX_EVENTS);
    const changes: EventChange[] = [];
    const warnings: string[] = [];
    const tagName = (id: Id<"attendanceTags">) => tags.names.get(id) ?? id;
    const countsFor = (subgroups: string[]) => settings.jointWeeklies || subgroups.length === 1;
    const held = new Map<string, HeldWeekly[]>();
    const hold = (campus: string, weekly: HeldWeekly) => held.set(campus, [...(held.get(campus) ?? []), weekly]);
    for (const event of events) {
      const subgroups = normalizeSubgroups(event.subgroups);
      const owner = ownerCampus(subgroups);
      if (event.weekly && owner && countsFor(subgroups)) {
        hold(owner, { eventId: event._id, at: event.dateStart, count: 1, name: event.name, mark: event.weekly });
      }
    }
    const infer = (event: Doc<"events">, owner: string): WeeklyMark => {
      const system = termSystemFor(owner, settings);
      const fromName = markFromName(event.name, system);
      const suggested = suggestWeekly(held.get(owner) ?? [], event.dateStart, system, settings.termGapDays);
      return {
        year: sydneyYmd(new Date(event.dateStart)).year,
        slot: fromName.slot ?? suggested.slot,
        week: fromName.week ?? suggested.week,
      };
    };

    for (const event of events) {
      const beforeTags = event.tagIds ?? [];
      const subgroups = normalizeSubgroups(event.subgroups);
      const owner = ownerCampus(subgroups);
      const looksWeekly = !!event.weekly || beforeTags.some((id) => weekliesIds.has(id));
      if (looksWeekly && !owner) {
        warnings.push(`"${event.name}" (${dateOf(event.dateStart)}) has the weekly tag but no campus; treated as an Other event`);
      }
      const isWeekly = looksWeekly && !!owner;
      let name = event.name;
      let mark: WeeklyMark | null = event.weekly ?? null;
      let nextTags = beforeTags.filter((id) => !tags.mergedIds.has(id) && (isWeekly || !weekliesIds.has(id)));
      if (beforeTags.some((id) => tags.mergedIds.has(id)) && tags.socialId && !isWeekly) {
        nextTags = [...nextTags, tags.socialId];
      }
      let unmapped: string | undefined;

      if (isWeekly && owner) {
        const system = termSystemFor(owner, settings);
        if (!mark) {
          mark = infer(event, owner);
          if (countsFor(subgroups)) {
            hold(owner, { eventId: event._id, at: event.dateStart, count: 1, name: event.name, mark });
          }
        }
        const dateYear = sydneyYmd(new Date(event.dateStart)).year;
        if (mark.year !== dateYear) {
          warnings.push(`"${event.name}" (${dateOf(event.dateStart)}) is marked ${mark.year}, not ${dateYear}`);
        }
        if (mark.week > 14) warnings.push(`"${event.name}" is marked week ${mark.week}`);
        name = weeklyName(system, mark.slot, mark.week);
        const labels = WEEKLY_LABELS.filter((l) => l.pattern.test(event.name)).map(
          (l) => tags.weeklyLabelIds.get(l.name)!
        );
        nextTags = [
          tags.weekliesId,
          ...nextTags.filter((id) => !weekliesIds.has(id) && id !== eventsPpn && id !== tags.weekliesId),
          ...labels,
        ];
        const rest = leftoverWords(event.name);
        if (rest) unmapped = rest;
      } else {
        const fromName = EVENT_NAME_TAGS.filter((t) => t.pattern.test(event.name))
          .map((t) => tags.eventTagIds.get(t.name))
          .filter((id): id is Id<"attendanceTags"> => !!id);
        nextTags = [...nextTags, ...fromName];
        const sow = subgroups.some((s) => isOrgWideSubgroup(s));
        if (sow && eventsPpn && twig && nextTags.includes(eventsPpn)) nextTags = [...nextTags, twig];
      }

      nextTags = [...new Set(nextTags)];
      const sameTags =
        nextTags.length === beforeTags.length && nextTags.every((id) => beforeTags.includes(id));
      const sameMark = JSON.stringify(mark) === JSON.stringify(event.weekly ?? null);
      if (name === event.name && sameTags && sameMark) continue;
      changes.push({
        eventId: event._id,
        date: dateOf(event.dateStart),
        subgroups,
        kind: isWeekly ? "weekly" : "event",
        before: { name: event.name, tags: beforeTags.map(tagName), mark: event.weekly ?? null },
        after: { name, tags: nextTags.map(tagName), mark },
        ...(unmapped ? { unmapped } : {}),
      });
      if (apply) {
        await ctx.db.patch("events", event._id, {
          name,
          tagIds: nextTags.length ? nextTags : undefined,
          ...(mark ? { weekly: mark } : {}),
        });
      }
    }

    if (apply) {
      for (const id of tags.mergedIds) await ctx.db.delete("attendanceTags", id);
      await logAttendanceAction(ctx, {
        actorEmail: ACTOR,
        entityType: "event",
        action: "event.update",
        summary: `Weekly names and tags tidied (2.8.0): ${changes.length} events, ${tags.changes.length} tag changes`,
      });
    }

    return { dryRun, tagChanges: tags.changes, eventChanges: changes, warnings };
  },
});
