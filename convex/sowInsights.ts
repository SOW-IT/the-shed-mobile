import { v } from "convex/values";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import {
  computePpn,
  computeTwig,
  isSowMode,
  SOW_TABS,
  sowModeOf,
  staffYearLabel,
  type SowEvent,
} from "../shared/sowInsights";
import { buildPpnBlocks, buildTwigBlocks } from "../shared/sowInsightsView";
import { Doc } from "./_generated/dataModel";
import { query, QueryCtx } from "./_generated/server";
import { currentStaffYear, optionalProfile } from "./model";
import { readSettings, resolvePeople } from "./weeklyInsights";
import { weeklyBlockValidator } from "./weeklyInsightsData";

const MAX_EVENTS = 5000;
const MAX_TAGS = 500;
const MAX_SIGN_INS_PER_EVENT = 2000;

async function toSowEvent(ctx: QueryCtx, event: Doc<"events">): Promise<SowEvent> {
  const rows = await ctx.db
    .query("attendance")
    .withIndex("by_event", (q) => q.eq("eventId", event._id))
    .take(MAX_SIGN_INS_PER_EVENT);
  const people = new Set(rows.map((r) => `member:${r.memberId}`));
  return { id: event._id, name: event.name, at: event.dateStart, people: [...people] };
}

export const tabs = query({
  args: {},
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        picker: v.union(v.literal("range"), v.literal("years")),
        pickerTitle: v.optional(v.string()),
      })
    )
  ),
  handler: async (ctx) => ((await optionalProfile(ctx)) ? SOW_TABS : null),
});

export const view = query({
  args: {
    mode: v.string(),
    staffYear: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      years: v.array(v.object({ key: v.string(), label: v.string() })),
      year: v.number(),
      blocks: v.array(weeklyBlockValidator),
    })
  ),
  handler: async (ctx, { mode, staffYear }) => {
    if (!(await optionalProfile(ctx))) return null;
    if (!isSowMode(mode)) {
      return {
        years: [],
        year: currentStaffYear(),
        blocks: [
          {
            type: "empty" as const,
            icon: "sparkles-outline",
            title: "Not available",
            message: "This view isn't available any more. Pick another one above.",
          },
        ],
      };
    }
    const now = Date.now();
    const tags = new Map((await ctx.db.query("attendanceTags").take(MAX_TAGS)).map((t) => [t._id, t]));
    const events = (
      await ctx.db.query("events").withIndex("by_dateStart").order("desc").take(MAX_EVENTS)
    ).filter((e) => sowModeOf((e.tagIds ?? []).flatMap((id) => tags.get(id) ?? [])) === mode);

    const current = currentStaffYear();
    const years = [
      ...new Set([current, ...events.map((e) => staffYearForDate(new Date(e.dateStart)))]),
    ].sort((a, b) => b - a);
    const year = staffYear !== undefined && years.includes(staffYear) ? staffYear : current;
    const inYear = (y: number) =>
      events.filter((e) => e.dateStart >= staffYearStartMs(y) && e.dateStart < staffYearStartMs(y + 1));
    const load = (list: Doc<"events">[]) => Promise.all(list.map((e) => toSowEvent(ctx, e)));

    const [thisYear, lastYear] = await Promise.all([load(inYear(year)), load(inYear(year - 1))]);
    const keys = [...new Set([...thisYear, ...lastYear].flatMap((e) => e.people))];
    const people = new Map(
      (await resolvePeople(ctx, keys, [year - 1, year])).map((person) => [person.key, person])
    );
    const yearOptions = years.map((y) => ({ key: String(y), label: staffYearLabel(y) }));

    if (mode === "twig") {
      const { settings } = await readSettings(ctx);
      const rules = { regularShare: settings.regularShare, followUpMisses: settings.followUpMisses };
      const result = computeTwig({ year, events: thisYear, lastEvents: lastYear, people, now, rules });
      return {
        years: yearOptions,
        year,
        blocks: buildTwigBlocks({ result, people, missesForFollowUp: rules.followUpMisses }),
      };
    }
    const earlier = await load(events.filter((e) => e.dateStart < staffYearStartMs(year - 1)));
    const result = computePpn({
      year,
      events: thisYear,
      lastEvents: lastYear,
      earlier: [...earlier, ...lastYear],
      people,
    });
    return { years: yearOptions, year, blocks: buildPpnBlocks({ result }) };
  },
});
