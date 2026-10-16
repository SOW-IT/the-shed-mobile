/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { WeeklyBlock } from "../shared/weeklyInsightsView";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = Date.UTC(2026, 10, 20, 2);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const ADMIN = "admin@sow.org.au";
const UNSW = "University of New South Wales";
const USYD = "University of Sydney";
const MQ = "Macquarie University";
const UTS = "University of Technology, Sydney";
const SOW = "SOW";
const mon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 8);

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

type Block = WeeklyBlock;
const pick = <K extends Block["type"]>(blocks: Block[], type: K) =>
  blocks.filter((b): b is Extract<Block, { type: K }> => b.type === type);

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run(async (ctx) => {
    const tag = (name: string, list: "events" | "weeklies") => ctx.db.insert("attendanceTags", { name, list });
    const twig = await tag("TWIG", "events");
    const ppn = await tag("PPN", "events");
    const weeklyPpn = await tag("PPN", "weeklies");
    const campusField = await ctx.db.insert("attendanceMetadata", {
      key: "Campus",
      type: "select",
      order: 0,
      values: { c1: UTS },
    });
    const member = (name: string, metadata: Record<string, string> = {}) =>
      ctx.db.insert("attendanceMembers", { name, metadata });
    const lee = await member("Lee Leader");
    const uma = await member("Uma Usyd");
    const olly = await member("Olly Organiser");
    const nina = await member("Nina None", { [campusField]: "c1" });
    const newbie = await member("Ned New");
    const pat = await member("Pat Placeholder");
    const walkIn = await member("Wes Walkin");
    const zara = await member("Zara Zero");
    const profile = async (memberId: Id<"attendanceMembers">, email: string, year: number, role: string, university?: string) =>
      ctx.db.insert("staffProfiles", {
        email,
        year,
        memberId,
        name: (await ctx.db.get(memberId))!.name,
        assignments: [{ role, ...(university ? { university } : { department: "Ministry" }) }],
      });
    await profile(lee, "lee@sow.org.au", 2026, "Student Leader", UNSW);
    await profile(lee, "lee@sow.org.au", 2027, "Student Leader", UNSW);
    await profile(uma, "uma@sow.org.au", 2027, "President", USYD);
    await profile(zara, "zara@sow.org.au", 2027, "Student Leader", UTS);
    await profile(olly, "olly@sow.org.au", 2026, "Executive", MQ);
    await profile(olly, "olly@sow.org.au", 2027, "Staff");
    await ctx.db.insert("staffProfiles", { email: "pat@sow.org.au", year: 2027, memberId: pat, name: "Pat Placeholder", assignments: [] });

    const event = async (name: string, at: number, tagIds: Id<"attendanceTags">[], who: Id<"attendanceMembers">[], subgroups = [SOW]) => {
      const eventId = await ctx.db.insert("events", { name, dateStart: at, dateEnd: at + 3600_000, subgroups, tagIds });
      for (const memberId of who) {
        await ctx.db.insert("attendance", { eventId, memberId, signInTime: at });
      }
    };
    await event("OCT 2023 TWIG", mon(2023, 10, 9), [twig], [lee]);
    await event("OCT 13th TWIG", mon(2025, 10, 13), [twig], [lee, olly]);
    await event("NOV 10th TWIG", mon(2025, 11, 10), [twig], [lee]);
    await event("TWIG 1 Dec", mon(2025, 12, 1), [twig], []);
    await event("TWIG Feb", mon(2026, 2, 2), [twig], [lee]);
    await event("November PPN", mon(2025, 11, 17), [twig, ppn], [lee, nina, walkIn]);
    await event("MARCH PPN", mon(2026, 3, 17), [twig, ppn], [lee]);
    await event("Intercampus PPN", mon(2026, 8, 1), [ppn], [lee, uma], [UNSW]);
    await event("BAM PPN weekly", mon(2026, 8, 5), [weeklyPpn], [lee], [UNSW]);
    const removed = await tag("Removed", "events");
    await ctx.db.delete("attendanceTags", removed);
    await event("Old tag", mon(2026, 8, 6), [removed], [lee]);

    await event("TWIG OCT 12", mon(2026, 10, 12), [twig], [lee, uma, olly, nina, pat]);
    await event("TWIG OCT 19", mon(2026, 10, 19), [twig], [lee, uma]);
    await event("TWIG OCT 26", mon(2026, 10, 26), [twig], [uma]);
    await event("TWIG NOV 9", mon(2026, 11, 9), [twig], [uma]);
    await event("TWIG NOV 16", mon(2026, 11, 16), [twig], []);
    await event("November PPN", mon(2026, 11, 17), [ppn, twig], [lee, uma, nina, newbie]);
    await event("TWIG DEC 7", mon(2026, 12, 7), [twig], []);
    await event("December PPN", mon(2026, 12, 15), [twig, ppn], []);
    await event("TWIG OCT 2027", mon(2027, 10, 11), [twig], []);
  });
  return { t, admin: asUser(t, ADMIN) };
}

describe("SOW TWIG and PPN Insights", () => {
  test("only staff see them", async () => {
    const { t } = await setup();
    expect(await t.query(api.sowInsights.view, { mode: "twig" })).toBeNull();
  });

  test("TWIG counts campus leaders, flags people with no staff profile, and follows up regulars", async () => {
    const { admin } = await setup();
    const view = (await admin.query(api.sowInsights.view, { mode: "twig" }))!;
    expect(view.year).toBe(2027);
    expect(view.years).toEqual([
      { key: "2027", label: "Staff year 2027" },
      { key: "2026", label: "Staff year 2026" },
      { key: "2024", label: "Staff year 2024" },
    ]);
    const blocks = view.blocks;
    expect(pick(blocks, "caption")[0].text).toBe(
      "Staff year 2027: 4 TWIGs so far, compared with staff year 2026, to 20 Nov 2025. Only campus leaders are counted."
    );
    const cards = pick(blocks, "cards")[0].cards;
    expect(cards.map((c) => [c.label, c.value, c.hint])).toEqual([
      ["Average attendance", "1.5", "vs 1.5"],
      ["People", "2", "vs 2"],
      ["Regulars", "2", undefined],
    ]);
    const bars = pick(blocks, "multiBars")[0];
    expect(bars.points.map((p) => [p.label, p.segments.map((s) => s.value)])).toEqual([
      ["12 Oct", [2, 2]],
      ["19 Oct", [2, 1]],
      ["26 Oct", [1, 1]],
      ["9 Nov", [1, 0]],
    ]);
    expect(pick(blocks, "breakdown")[0].rows).toEqual([
      { label: "USYD", value: 4, colour: expect.any(String) },
      { label: "UNSW", value: 2, colour: expect.any(String) },
    ]);
    const followUp = pick(blocks, "followUpGroups")[0];
    expect(followUp.groups.flatMap((g) => g.people.map((p) => [p.name, p.reason, p.subgroup]))).toEqual([
      ["Lee Leader", "Regular, but missed the last 2 TWIGs", UNSW],
    ]);
    const everyone = pick(blocks, "people")[0];
    expect(
      everyone.rows
        .map((r) => [r.name, r.section, r.primary, r.warning ?? null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    ).toEqual([
      ["Lee Leader", "leader", "2/4 · 50%", null],
      ["Nina None", "none", "1/4 · 25%", "No staff profile for 2027"],
      ["Olly Organiser", "staff", "1/4 · 25%", null],
      ["Pat Placeholder", "none", "1/4 · 25%", "No staff profile for 2027"],
      ["Uma Usyd", "leader", "4/4 · 100%", null],
      ["Zara Zero", "leader", "0/4 · 0%", null],
    ]);
    expect(everyone.rows.find((r) => r.name === "Zara Zero")).toMatchObject({
      secondary: "Hasn't come to a TWIG this staff year",
      tags: ["leader", "notYet"],
      subgroup: UTS,
    });
    expect(everyone.filters.map((f) => f.key)).toEqual(["leader", "staff", "none", "regular", "notYet"]);
    expect(
      Object.fromEntries(everyone.rows.map((r) => [r.name, [r.subgroup ?? null, r.dimmed ?? false, r.badge?.label ?? null]]))
    ).toEqual({
      "Lee Leader": [UNSW, false, "Regular"],
      "Nina None": [UTS, false, null],
      "Olly Organiser": [null, true, null],
      "Pat Placeholder": [null, false, null],
      "Uma Usyd": [USYD, false, "Regular"],
      "Zara Zero": [UTS, false, null],
    });
    expect(everyone.rows.every((r) => !r.secondary.startsWith("Regular"))).toBe(true);
    expect(pick(blocks, "eventList")[0].rows).toEqual([{ title: "TWIG NOV 16", subtitle: "16 Nov 2026" }]);
  });

  test("a past staff year has no follow-up, and counts that year's roles", async () => {
    const { admin } = await setup();
    const view = (await admin.query(api.sowInsights.view, { mode: "twig", staffYear: 2026 }))!;
    expect(view.year).toBe(2026);
    expect(pick(view.blocks, "caption")[0].text).toBe(
      "Staff year 2026: 3 TWIGs. There's no earlier staff year to compare with. Only campus leaders are counted."
    );
    expect(pick(view.blocks, "followUpGroups")).toEqual([]);
    expect(pick(view.blocks, "breakdown")[0].rows).toEqual([
      { label: "UNSW", value: 3, colour: expect.any(String) },
      { label: "MACQ", value: 1, colour: expect.any(String) },
    ]);
  });

  test("the tabs come from the server, and an unknown tab shows a note instead of failing", async () => {
    const { t, admin } = await setup();
    expect(await t.query(api.sowInsights.tabs, {})).toBeNull();
    expect((await admin.query(api.sowInsights.tabs, {}))!.map((tab) => [tab.key, tab.picker])).toEqual([
      ["campuses", "range"],
      ["twig", "years"],
      ["ppn", "years"],
    ]);
    const gone = (await admin.query(api.sowInsights.view, { mode: "retreat" }))!;
    expect(gone.years).toEqual([]);
    expect(gone.blocks).toEqual([expect.objectContaining({ type: "empty", title: "Not available" })]);
  });

  test("an unknown staff year falls back to the current one", async () => {
    const { admin } = await setup();
    expect((await admin.query(api.sowInsights.view, { mode: "twig", staffYear: 1999 }))!.year).toBe(2027);
  });

  test("PPN shows cards and charts: against last year, who came, first-timers and campuses", async () => {
    const { admin } = await setup();
    const view = (await admin.query(api.sowInsights.view, { mode: "ppn" }))!;
    expect(view.years.map((y) => y.key)).toEqual(["2027", "2026"]);
    expect(view.blocks.map((b) => b.type)).toEqual([
      "caption", "heading", "cards", "multiBars", "heading", "cards", "multiBars", "stacked", "breakdown",
    ]);
    expect(pick(view.blocks, "heading").map((h) => h.text)).toEqual(["Turnout", "Who came"]);
    expect(pick(view.blocks, "caption")[0].text).toBe("Staff year 2027: 1 PPN.");
    expect(
      pick(view.blocks, "cards").flatMap((b) => b.cards).map((c) => [c.label, c.value, c.delta?.text ?? null, c.hint ?? null])
    ).toEqual([
      ["Average per PPN", "4", "+33%", "vs 3"],
      ["People", "4", null, null],
      ["Campus leaders", "50%", null, "2 of 4 sign-ins"],
      ["First-timers", "2", null, null],
    ]);
    const [byPpn, who] = pick(view.blocks, "multiBars");
    expect(byPpn.points.map((p) => [p.label, p.segments.map((x) => x.value)])).toEqual([["17 Nov", [4, 3]]]);
    expect(who.stacked).toBe(true);
    expect(who.legend.map((l) => l.label)).toEqual(["Campus leaders", "No staff profile"]);
    expect(who.points[0].segments.map((x) => [x.key, x.value])).toEqual([["leader", 2], ["none", 2]]);
    expect(pick(view.blocks, "stacked")[0].points.map((p) => [p.fresh, p.returning])).toEqual([[2, 2]]);
    expect(pick(view.blocks, "breakdown")[0].rows.map((r) => [r.label, r.value])).toEqual([
      ["UNSW", 1],
      ["USYD", 1],
      ["UTS", 1],
      ["No campus", 1],
    ]);

    const past = (await admin.query(api.sowInsights.view, { mode: "ppn", staffYear: 2026 }))!;
    expect(pick(past.blocks, "caption")[0].text).toBe("Staff year 2026: 2 PPNs.");
    const [pastByPpn] = pick(past.blocks, "multiBars");
    expect(pastByPpn.legend.map((l) => l.key)).toEqual(["now"]);
    expect(pastByPpn.points.map((p) => [p.label, p.segments.map((x) => x.value)])).toEqual([
      ["17 Nov", [3]],
      ["17 Mar", [1]],
    ]);
    expect(pick(past.blocks, "stacked")[0].points.map((p) => [p.fresh, p.returning])).toEqual([
      [3, 0],
      [0, 1],
    ]);
    const [pastAverage] = pick(past.blocks, "cards")[0].cards;
    expect(pastAverage.value).toBe("2");
    expect(pastAverage.hint).toBeUndefined();
  });

  test("a staff year with no roll taken yet says so", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    await t.run(async (ctx) => {
      const twig = await ctx.db.insert("attendanceTags", { name: "TWIG" });
      await ctx.db.insert("events", { name: "TWIG OCT 12", dateStart: mon(2026, 10, 12), dateEnd: mon(2026, 10, 12), subgroups: [SOW], tagIds: [twig] });
      await ctx.db.insert("events", { name: "Untagged", dateStart: mon(2026, 10, 13), dateEnd: mon(2026, 10, 13), subgroups: [SOW] });
    });
    const admin = asUser(t, ADMIN);
    const twigView = (await admin.query(api.sowInsights.view, { mode: "twig" }))!;
    expect(twigView.blocks.map((b) => b.type)).toEqual(["empty", "eventList"]);
    const ppnView = (await admin.query(api.sowInsights.view, { mode: "ppn" }))!;
    expect(ppnView.blocks.map((b) => b.type)).toEqual(["empty"]);
    expect(ppnView.years).toEqual([{ key: "2027", label: "Staff year 2027" }]);
  });
});

describe("app update policy", () => {
  test("nothing is asked until a policy is set, then older apps are nudged or blocked", async () => {
    const { t } = await setup();
    const status = (platform: "ios" | "android", version: string) =>
      t.query(api.appInstalls.updateStatus, { platform, version });
    expect(await status("ios", "2.5.8")).toEqual({ status: "ok", latest: null, message: null });

    await expect(
      t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", minimum: "latest" })
    ).rejects.toThrow(/isn't an app version/);
    expect(
      await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", recommended: "2.9.0" })
    ).toEqual({ minimum: null, recommended: "2.9.0", message: null });
    expect(await status("ios", "2.8.0")).toEqual({ status: "recommended", latest: "2.9.0", message: null });
    expect(await status("android", "2.8.0")).toEqual({ status: "ok", latest: null, message: null });

    expect(
      await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", minimum: "2.8.0" })
    ).toEqual({ minimum: "2.8.0", recommended: "2.9.0", message: null });
    expect(await status("ios", "2.7.0")).toEqual({ status: "required", latest: "2.9.0", message: null });
    expect(await status("ios", "2.9.0")).toEqual({ status: "ok", latest: "2.9.0", message: null });

    expect(
      await t.mutation(internal.appInstalls.setUpdatePolicy, {
        platform: "ios",
        recommended: null,
        message: "  Update for the new TWIG and PPN Insights.  ",
      })
    ).toEqual({ minimum: "2.8.0", recommended: null, message: "Update for the new TWIG and PPN Insights." });
    expect(await status("ios", "2.7.0")).toEqual({
      status: "required",
      latest: "2.8.0",
      message: "Update for the new TWIG and PPN Insights.",
    });
    expect(
      await t.mutation(internal.appInstalls.setUpdatePolicy, { platform: "ios", message: " " })
    ).toEqual({ minimum: "2.8.0", recommended: null, message: null });
  });
});
