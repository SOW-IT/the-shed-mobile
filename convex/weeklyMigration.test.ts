/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { leftoverWords } from "./weeklyMigration";
import type { WeeklyMark } from "../shared/weeklyInsights";

const modules = import.meta.glob("./**/*.ts");

const UNSW = "University of New South Wales";
const USYD = "University of Sydney";
const MQ = "Macquarie University";
const SOW = "SOW";
const wed = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 7);

type Tags = Record<string, Id<"attendanceTags">>;
type Events = Record<string, Id<"events">>;

async function seed(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const tag = (name: string, extra: Partial<Doc<"attendanceTags">> = {}) =>
      ctx.db.insert("attendanceTags", { name, ...extra });
    const tags: Tags = {
      weeklyMeeting: await tag("Weekly Meeting", { colour: "blue" }),
      event: await tag("Event"),
      otherEvents: await tag("Other Events"),
      social: await tag("Social", { subgroups: [USYD] }),
      ppn: await tag("PPN", { subgroups: [UNSW] }),
      twig: await tag("TWIG", { subgroups: [SOW] }),
      seasons: await tag("Seasons"),
      retreat: await tag("Retreat", { subgroups: [SOW] }),
      midSem: await tag("Mid-Sem Break", { subgroups: [USYD] }),
    };
    const event = (
      name: string,
      at: number,
      subgroups: string[],
      tagIds: Id<"attendanceTags">[] = [],
      weekly?: WeeklyMark
    ) =>
      ctx.db.insert("events", {
        name,
        dateStart: at,
        dateEnd: at + 2 * 3600_000,
        subgroups,
        ...(tagIds.length ? { tagIds } : {}),
        ...(weekly ? { weekly } : {}),
      });
    const wm = tags.weeklyMeeting;
    const events: Events = {
      mayPpn: await event("MAY PPN", wed(2025, 5, 14), [SOW, UNSW, USYD], [tags.ppn]),
      usydWeek16: await event("USYD WEEKLIES S1W16", wed(2025, 6, 11), [USYD], [wm], { year: 2025, slot: 1, week: 16 }),
      gamesNight: await event("Weeklies T2W3 + GAMES NIGHT", wed(2025, 6, 18), [UNSW], [wm, tags.event], { year: 2025, slot: 2, week: 3 }),
      retreat: await event("Retreat", wed(2025, 7, 9), [SOW], [tags.retreat]),
      seasons: await event("SEASONS #3", wed(2025, 7, 30), [USYD]),
      intercampusPpn: await event("Intercampus PPN", wed(2025, 8, 6), [UNSW, USYD], [tags.event]),
      bam: await event("WK #4 [BAM NIGHT]", wed(2025, 8, 20), [MQ], [wm]),
      trivia: await event("Trivia", wed(2025, 9, 10), [MQ], [tags.otherEvents]),
      t3w1: await event("T3W1", wed(2025, 9, 17), [UNSW], [wm], { year: 2025, slot: 3, week: 1 }),
      mega: await event("MEGA WEEKLIES", wed(2025, 9, 24), [UNSW, SOW, USYD], [wm, tags.otherEvents]),
      oldPhone: await event("Weeklies", wed(2025, 10, 1), [UNSW], [wm]),
      t3w4: await event("WEEKLIES T3W4", wed(2025, 10, 8), [UNSW], [wm]),
      twig: await event("TWIG OCT 12", Date.UTC(2025, 9, 12, 2), [SOW]),
      s2Ppn: await event("S2 WM #13 PPN", wed(2025, 10, 22), [USYD], [wm, tags.ppn], { year: 2025, slot: 2, week: 13 }),
      halloween: await event("T3W8 Halloween Weeklies", wed(2025, 10, 29), [UNSW], [wm], { year: 2025, slot: 3, week: 8 }),
      grad: await event("Grad + PPN T3W10", wed(2025, 11, 12), [UNSW], [wm, tags.ppn]),
      farewell: await event("Farewell Event", wed(2025, 11, 26), [SOW], [tags.ppn]),
      sowWeekly: await event("SOW WEEKLIES", wed(2025, 12, 3), [SOW, UNSW], [wm], { year: 2025, slot: 2, week: 9 }),
      january: await event("Weeklies T3W12", wed(2026, 1, 7), [UNSW], [wm], { year: 2025, slot: 3, week: 12 }),
    };
    return { tags, events };
  });
}

const snapshot = (t: TestConvex<typeof schema>) =>
  t.run(async (ctx) => ({
    tags: await ctx.db.query("attendanceTags").collect(),
    events: await ctx.db.query("events").collect(),
    audit: await ctx.db.query("attendanceAuditLog").collect(),
  }));

const migrate = (t: TestConvex<typeof schema>, dryRun?: boolean) =>
  t.mutation(internal.weeklyMigration.run, dryRun === undefined ? {} : { dryRun });

const EXPECTED_TAG_CHANGES = [
  'Rename "Weekly Meeting" to "Weeklies"',
  'Merge "Event" into "Social" and delete it',
  'Merge "Other Events" into "Social" and delete it',
  `"Social": available to every campus and SOW (was ${USYD})`,
  `"PPN": available to every campus and SOW (was ${UNSW})`,
  '"Retreat": available to every campus and SOW (was SOW)',
  `"Mid-Sem Break": available to every campus and SOW (was ${USYD})`,
  'Create "PPN" (Weeklies)',
  'Create "BAM" (Weeklies)',
  'Create "Games Night" (Weeklies)',
  'Create "Mega" (Weeklies)',
  'Create "Grad" (Weeklies)',
];

const EXPECTED_WARNINGS = [
  '"USYD WEEKLIES S1W16" is marked week 16',
  '"SOW WEEKLIES" (2025-12-03) is owned by SOW, which has no weeklies; treated as an Other event',
  '"Weeklies T3W12" (2026-01-07) is marked 2025, not 2026',
];

const mark = (year: number, slot: number, week: number) => ({ year, slot, week });

function expectedEventChanges(events: Events) {
  return [
    {
      eventId: events.mayPpn,
      date: "2025-05-14",
      subgroups: [SOW, UNSW, USYD],
      kind: "event",
      before: { name: "MAY PPN", tags: ["PPN"], mark: null },
      after: { name: "MAY PPN", tags: ["PPN", "TWIG"], mark: null },
    },
    {
      eventId: events.usydWeek16,
      date: "2025-06-11",
      subgroups: [USYD],
      kind: "weekly",
      before: { name: "USYD WEEKLIES S1W16", tags: ["Weeklies"], mark: mark(2025, 1, 16) },
      after: { name: "S1W16", tags: ["Weeklies"], mark: mark(2025, 1, 16) },
    },
    {
      eventId: events.gamesNight,
      date: "2025-06-18",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "Weeklies T2W3 + GAMES NIGHT", tags: ["Weeklies", "Event"], mark: mark(2025, 2, 3) },
      after: { name: "T2W3", tags: ["Weeklies", "Games Night (weekly)"], mark: mark(2025, 2, 3) },
    },
    {
      eventId: events.seasons,
      date: "2025-07-30",
      subgroups: [USYD],
      kind: "event",
      before: { name: "SEASONS #3", tags: [], mark: null },
      after: { name: "SEASONS #3", tags: ["Seasons"], mark: null },
    },
    {
      eventId: events.intercampusPpn,
      date: "2025-08-06",
      subgroups: [UNSW, USYD],
      kind: "event",
      before: { name: "Intercampus PPN", tags: ["Event"], mark: null },
      after: { name: "Intercampus PPN", tags: ["Social", "PPN"], mark: null },
    },
    {
      eventId: events.bam,
      date: "2025-08-20",
      subgroups: [MQ],
      kind: "weekly",
      before: { name: "WK #4 [BAM NIGHT]", tags: ["Weeklies"], mark: null },
      after: { name: "S2W4", tags: ["Weeklies", "BAM (weekly)"], mark: mark(2025, 2, 4) },
    },
    {
      eventId: events.trivia,
      date: "2025-09-10",
      subgroups: [MQ],
      kind: "event",
      before: { name: "Trivia", tags: ["Other Events"], mark: null },
      after: { name: "Trivia", tags: ["Social"], mark: null },
    },
    {
      eventId: events.mega,
      date: "2025-09-24",
      subgroups: [UNSW, SOW, USYD],
      kind: "weekly",
      before: { name: "MEGA WEEKLIES", tags: ["Weeklies", "Other Events"], mark: null },
      after: { name: "T3W2", tags: ["Weeklies", "Mega (weekly)"], mark: mark(2025, 3, 2) },
    },
    {
      eventId: events.oldPhone,
      date: "2025-10-01",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "Weeklies", tags: ["Weeklies"], mark: null },
      after: { name: "T3W3", tags: ["Weeklies"], mark: mark(2025, 3, 3) },
    },
    {
      eventId: events.t3w4,
      date: "2025-10-08",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "WEEKLIES T3W4", tags: ["Weeklies"], mark: null },
      after: { name: "T3W4", tags: ["Weeklies"], mark: mark(2025, 3, 4) },
    },
    {
      eventId: events.twig,
      date: "2025-10-12",
      subgroups: [SOW],
      kind: "event",
      before: { name: "TWIG OCT 12", tags: [], mark: null },
      after: { name: "TWIG OCT 12", tags: ["TWIG"], mark: null },
    },
    {
      eventId: events.s2Ppn,
      date: "2025-10-22",
      subgroups: [USYD],
      kind: "weekly",
      before: { name: "S2 WM #13 PPN", tags: ["Weeklies", "PPN"], mark: mark(2025, 2, 13) },
      after: { name: "S2W13", tags: ["Weeklies", "PPN (weekly)"], mark: mark(2025, 2, 13) },
    },
    {
      eventId: events.halloween,
      date: "2025-10-29",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "T3W8 Halloween Weeklies", tags: ["Weeklies"], mark: mark(2025, 3, 8) },
      after: { name: "T3W8", tags: ["Weeklies"], mark: mark(2025, 3, 8) },
      unmapped: "Halloween",
    },
    {
      eventId: events.grad,
      date: "2025-11-12",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "Grad + PPN T3W10", tags: ["Weeklies", "PPN"], mark: null },
      after: { name: "T3W10", tags: ["Weeklies", "PPN (weekly)", "Grad (weekly)"], mark: mark(2025, 3, 10) },
    },
    {
      eventId: events.farewell,
      date: "2025-11-26",
      subgroups: [SOW],
      kind: "event",
      before: { name: "Farewell Event", tags: ["PPN"], mark: null },
      after: { name: "Farewell Event", tags: ["PPN", "TWIG"], mark: null },
    },
    {
      eventId: events.sowWeekly,
      date: "2025-12-03",
      subgroups: [SOW, UNSW],
      kind: "event",
      before: { name: "SOW WEEKLIES", tags: ["Weeklies"], mark: mark(2025, 2, 9) },
      after: { name: "SOW WEEKLIES", tags: [], mark: null },
    },
    {
      eventId: events.january,
      date: "2026-01-07",
      subgroups: [UNSW],
      kind: "weekly",
      before: { name: "Weeklies T3W12", tags: ["Weeklies"], mark: mark(2025, 3, 12) },
      after: { name: "T3W12", tags: ["Weeklies"], mark: mark(2025, 3, 12) },
    },
  ];
}

describe("weeklyMigration.run", () => {
  test("a dry run, the default, reports everything and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const { events } = await seed(t);
    const before = await snapshot(t);
    const report = await migrate(t);
    expect(report).toEqual({
      dryRun: true,
      tagChanges: EXPECTED_TAG_CHANGES,
      eventChanges: expectedEventChanges(events),
      warnings: EXPECTED_WARNINGS,
    });
    expect(await migrate(t, true)).toEqual(report);
    expect(await snapshot(t)).toEqual(before);
  });

  test("applying it renames, merges, opens and creates tags", async () => {
    const t = convexTest(schema, modules);
    const { tags } = await seed(t);
    const report = await migrate(t, false);
    expect(report.dryRun).toBe(false);
    expect(report.tagChanges).toEqual(EXPECTED_TAG_CHANGES);
    const after = await snapshot(t);
    expect(
      after.tags.map((tag) => ({ name: tag.name, list: tag.list, colour: tag.colour, subgroups: tag.subgroups }))
    ).toEqual([
      { name: "Weeklies", list: undefined, colour: "blue", subgroups: undefined },
      { name: "Social", list: "events", colour: undefined, subgroups: undefined },
      { name: "PPN", list: "events", colour: undefined, subgroups: undefined },
      { name: "TWIG", list: "events", colour: undefined, subgroups: [SOW] },
      { name: "Seasons", list: "events", colour: undefined, subgroups: undefined },
      { name: "Retreat", list: "events", colour: undefined, subgroups: undefined },
      { name: "Mid-Sem Break", list: "events", colour: undefined, subgroups: undefined },
      { name: "PPN", list: "weeklies", colour: "emerald", subgroups: undefined },
      { name: "BAM", list: "weeklies", colour: "orange", subgroups: undefined },
      { name: "Games Night", list: "weeklies", colour: "cyan", subgroups: undefined },
      { name: "Mega", list: "weeklies", colour: "purple", subgroups: undefined },
      { name: "Grad", list: "weeklies", colour: "yellow", subgroups: undefined },
    ]);
    expect(after.tags[0]._id).toBe(tags.weeklyMeeting);
    expect(after.tags.map((tag) => tag._id)).not.toContain(tags.event);
    expect(after.tags.map((tag) => tag._id)).not.toContain(tags.otherEvents);
    expect(after.audit).toHaveLength(1);
    expect(after.audit[0]).toMatchObject({
      actorEmail: "it@sow.org.au",
      entityType: "event",
      action: "event.update",
      summary: "Weekly names and tags tidied (2.8.0): 17 events, 12 tag changes",
    });
  });

  test("applying it writes the names, marks and tags it reported", async () => {
    const t = convexTest(schema, modules);
    const { tags, events } = await seed(t);
    const report = await migrate(t, false);
    expect(report.eventChanges).toEqual(expectedEventChanges(events));
    expect(report.warnings).toEqual(EXPECTED_WARNINGS);
    const after = await snapshot(t);
    const byId = new Map(after.events.map((e) => [e._id, e]));
    const weeklyLabel = (name: string) => after.tags.find((tag) => tag.name === name && tag.list === "weeklies")!._id;
    const read = (key: string) => {
      const e = byId.get(events[key])!;
      return { name: e.name, tagIds: e.tagIds, weekly: e.weekly };
    };
    const wm = tags.weeklyMeeting;
    expect(read("mayPpn")).toEqual({ name: "MAY PPN", tagIds: [tags.ppn, tags.twig], weekly: undefined });
    expect(read("usydWeek16")).toEqual({ name: "S1W16", tagIds: [wm], weekly: mark(2025, 1, 16) });
    expect(read("gamesNight")).toEqual({ name: "T2W3", tagIds: [wm, weeklyLabel("Games Night")], weekly: mark(2025, 2, 3) });
    expect(read("retreat")).toEqual({ name: "Retreat", tagIds: [tags.retreat], weekly: undefined });
    expect(read("seasons")).toEqual({ name: "SEASONS #3", tagIds: [tags.seasons], weekly: undefined });
    expect(read("intercampusPpn")).toEqual({ name: "Intercampus PPN", tagIds: [tags.social, tags.ppn], weekly: undefined });
    expect(read("bam")).toEqual({ name: "S2W4", tagIds: [wm, weeklyLabel("BAM")], weekly: mark(2025, 2, 4) });
    expect(read("trivia")).toEqual({ name: "Trivia", tagIds: [tags.social], weekly: undefined });
    expect(read("t3w1")).toEqual({ name: "T3W1", tagIds: [wm], weekly: mark(2025, 3, 1) });
    expect(read("mega")).toEqual({ name: "T3W2", tagIds: [wm, weeklyLabel("Mega")], weekly: mark(2025, 3, 2) });
    expect(read("oldPhone")).toEqual({ name: "T3W3", tagIds: [wm], weekly: mark(2025, 3, 3) });
    expect(read("t3w4")).toEqual({ name: "T3W4", tagIds: [wm], weekly: mark(2025, 3, 4) });
    expect(read("twig")).toEqual({ name: "TWIG OCT 12", tagIds: [tags.twig], weekly: undefined });
    expect(read("s2Ppn")).toEqual({ name: "S2W13", tagIds: [wm, weeklyLabel("PPN")], weekly: mark(2025, 2, 13) });
    expect(read("halloween")).toEqual({ name: "T3W8", tagIds: [wm], weekly: mark(2025, 3, 8) });
    expect(read("grad")).toEqual({
      name: "T3W10",
      tagIds: [wm, weeklyLabel("PPN"), weeklyLabel("Grad")],
      weekly: mark(2025, 3, 10),
    });
    expect(read("farewell")).toEqual({ name: "Farewell Event", tagIds: [tags.ppn, tags.twig], weekly: undefined });
    expect(read("sowWeekly")).toEqual({ name: "SOW WEEKLIES", tagIds: undefined, weekly: undefined });
    expect(read("january")).toEqual({ name: "T3W12", tagIds: [wm], weekly: mark(2025, 3, 12) });
  });

  test("a second run changes nothing", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await migrate(t, false);
    const once = await snapshot(t);
    const again = await migrate(t, false);
    expect(again).toEqual({
      dryRun: false,
      tagChanges: [],
      eventChanges: [],
      warnings: [
        '"S1W16" is marked week 16',
        '"T3W12" (2026-01-07) is marked 2025, not 2026',
      ],
    });
    const twice = await snapshot(t);
    expect(twice.tags).toEqual(once.tags);
    expect(twice.events).toEqual(once.events);
    expect(twice.audit.map((row) => row.summary)).toEqual([
      "Weekly names and tags tidied (2.8.0): 17 events, 12 tag changes",
      "Weekly names and tags tidied (2.8.0): 0 events, 0 tag changes",
    ]);
    expect(await migrate(t)).toEqual({ ...again, dryRun: true });
  });

  test("with no Weeklies or Social tag yet, it makes them", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const event = await ctx.db.insert("attendanceTags", { name: "Event", list: "events" });
      const weekly = await ctx.db.insert("events", {
        name: "UNSW WEEKLIES T1W2",
        dateStart: wed(2026, 2, 25),
        dateEnd: wed(2026, 2, 25),
        subgroups: [UNSW],
        weekly: mark(2026, 1, 2),
      });
      const social = await ctx.db.insert("events", {
        name: "Picnic",
        dateStart: wed(2026, 3, 4),
        dateEnd: wed(2026, 3, 4),
        subgroups: [USYD],
        tagIds: [event],
      });
      return { weekly, social };
    });
    const dry = await migrate(t);
    expect(dry.tagChanges).toEqual([
      'Create "Weeklies"',
      'Merge "Event" into "Social" and delete it',
      'Create "Social" (Other events)',
      'Create "PPN" (Weeklies)',
      'Create "BAM" (Weeklies)',
      'Create "Games Night" (Weeklies)',
      'Create "Mega" (Weeklies)',
      'Create "Grad" (Weeklies)',
    ]);
    expect(dry.eventChanges.map((c) => [c.after.name, c.after.tags])).toEqual([
      ["T1W2", ["Weeklies"]],
      ["Picnic", ["Social"]],
    ]);
    expect(await t.run((ctx) => ctx.db.query("attendanceTags").collect())).toHaveLength(1);

    const applied = await migrate(t, false);
    expect(applied.tagChanges).toEqual(dry.tagChanges);
    const tags = await t.run((ctx) => ctx.db.query("attendanceTags").collect());
    const weeklies = tags.find((tag) => tag.name === "Weeklies")!;
    const social = tags.find((tag) => tag.name === "Social")!;
    expect(weeklies).toMatchObject({ colour: "amber" });
    expect(social).toMatchObject({ list: "events", colour: "emerald" });
    expect(tags.map((tag) => tag.name)).not.toContain("Event");
    const [weekly, picnic] = await t.run(async (ctx) => [await ctx.db.get(ids.weekly), await ctx.db.get(ids.social)]);
    expect(weekly).toMatchObject({ name: "T1W2", tagIds: [weeklies._id] });
    expect(picnic!.tagIds).toEqual([social._id]);
    expect(applied.eventChanges[1].after.tags).toEqual(["Social"]);
    expect(applied.eventChanges[0].after.tags).toEqual(["Weeklies"]);
  });

  test("a dry run reports the same terms and weeks the real run writes", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const weeklyTag = await ctx.db.insert("attendanceTags", { name: "Weekly Meeting" });
      const add = (name: string, at: number, weekly?: WeeklyMark) =>
        ctx.db.insert("events", {
          name,
          dateStart: at,
          dateEnd: at,
          subgroups: [MQ],
          tagIds: [weeklyTag],
          ...(weekly ? { weekly } : {}),
        });
      await add("S2W3", wed(2025, 8, 6), mark(2025, 2, 3));
      await add("WK #4", wed(2025, 8, 13));
      await add("Weeklies", wed(2025, 8, 20));
    });
    const marks = (report: Awaited<ReturnType<typeof migrate>>) =>
      report.eventChanges.map((c) => [c.before.name, c.after.name, c.after.mark]);
    const dry = await migrate(t);
    expect(marks(dry)).toEqual([
      ["WK #4", "S2W4", mark(2025, 2, 4)],
      ["Weeklies", "S2W5", mark(2025, 2, 5)],
    ]);
    expect(marks(await migrate(t, false))).toEqual(marks(dry));
  });

  test("both weekly tag names: Weeklies is kept and the old one is taken off weeklies", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const legacy = await ctx.db.insert("attendanceTags", { name: "Weekly Meeting" });
      const weeklies = await ctx.db.insert("attendanceTags", { name: "Weeklies" });
      const ppn = await ctx.db.insert("attendanceTags", { name: "PPN", list: "weeklies" });
      const event = await ctx.db.insert("events", {
        name: "S1W3 PPN",
        dateStart: wed(2026, 3, 11),
        dateEnd: wed(2026, 3, 11),
        subgroups: [USYD],
        tagIds: [legacy],
      });
      return { legacy, weeklies, ppn, event };
    });
    const report = await migrate(t, false);
    expect(report.tagChanges).toEqual([
      'Create "BAM" (Weeklies)',
      'Create "Games Night" (Weeklies)',
      'Create "Mega" (Weeklies)',
      'Create "Grad" (Weeklies)',
    ]);
    expect(report.eventChanges[0]).toMatchObject({
      before: { name: "S1W3 PPN", tags: ["Weeklies"], mark: null },
      after: { name: "S1W3", tags: ["Weeklies", "PPN (weekly)"], mark: mark(2026, 1, 3) },
    });
    const event = await t.run((ctx) => ctx.db.get(ids.event));
    expect(event).toMatchObject({ name: "S1W3", tagIds: [ids.weeklies, ids.ppn], weekly: mark(2026, 1, 3) });
    const legacy = await t.run((ctx) => ctx.db.get(ids.legacy));
    expect(legacy).toMatchObject({ name: "Weekly Meeting" });
    expect(legacy!.list).toBeUndefined();
  });

  test("leftover words are what the labels and week codes don't explain", () => {
    expect(leftoverWords("WEEKLIES T3W5")).toBe("");
    expect(leftoverWords("S2 WM #13 PPN")).toBe("");
    expect(leftoverWords("WK #4 [BAM NIGHT]")).toBe("");
    expect(leftoverWords("Weeklies T2W3 + GAMES NIGHT")).toBe("");
    expect(leftoverWords("Grad + PPN T3W10")).toBe("");
    expect(leftoverWords("MEGA WEEKLIES")).toBe("");
    expect(leftoverWords("UTSxUSYD Combined Weekly 2025")).toBe("");
    expect(leftoverWords("UNSW X MQ WEEK6 Weekly")).toBe("");
    expect(leftoverWords("Week 6 Weeklies")).toBe("");
    expect(leftoverWords("T3W8 Halloween Weeklies")).toBe("Halloween");
    expect(leftoverWords("Weeklies T1W2 - Pizza & Prayer!")).toBe("Pizza Prayer");
    expect(leftoverWords("Women's night T2 W 4")).toBe("Women's");
  });
});
