import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { asUser, newConvex, PINNED_NOW } from "../test/convexFixture";
import { shiftDay } from "../shared/calendar";
import { latestDevotionalDate } from "../shared/devotionals";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const TOMORROW = shiftDay(latestDevotionalDate(PINNED_NOW), 1);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("devotionals", () => {
  test("requires authentication", async () => {
    const t = newConvex();
    await expect(t.query(api.devotionals.byDate, { date: "2026-11-20" })).rejects.toThrow(/signed in/);
    await expect(t.query(api.devotionals.byMonth, { year: 2026, month: 11 })).rejects.toThrow(/signed in/);
    await expect(
      t.mutation(api.devotionals.save, {
        date: "2026-11-20",
        passage: "Psalm 23",
        notes: "",
        prayerPoints: "",
        base: null,
      })
    ).rejects.toThrow(/signed in/);
  });

  test("saves, updates, formats passages, deletes when cleared, and stays private per owner", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);

    const saved = await anna.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "ps 23",
      notes: "The Lord is my shepherd.",
      prayerPoints: "Rest and trust.",
      base: null,
    });
    expect(saved).toMatchObject({ date: "2026-11-20", passage: "Psalm 23", deleted: false });

    const fetched = await anna.query(api.devotionals.byDate, { date: "2026-11-20" });
    expect(fetched).toMatchObject({
      date: "2026-11-20",
      passage: "Psalm 23",
      notes: "The Lord is my shepherd.",
      prayerPoints: "Rest and trust.",
    });
    expect(await ben.query(api.devotionals.byDate, { date: "2026-11-20" })).toBeNull();
    expect(await anna.query(api.devotionals.byDate, { date: "not-a-date" })).toBeNull();

    const updated = await anna.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "john 15:1-17",
      notes: "Abide in me.",
      prayerPoints: "Fruitfulness.",
      base: saved.status === "saved" ? saved.updatedAt : null,
    });
    expect(updated).toMatchObject({ date: "2026-11-20", passage: "John 15:1-17", deleted: false });

    const cleared = await anna.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "   ",
      notes: "",
      prayerPoints: "",
      base: updated.status === "saved" ? updated.updatedAt : null,
    });
    expect(cleared).toMatchObject({ date: "2026-11-20", passage: "", deleted: true });
    expect(await anna.query(api.devotionals.byDate, { date: "2026-11-20" })).toBeNull();

    const clearedAgain = await anna.mutation(api.devotionals.save, {
      date: "2026-11-19",
      passage: "",
      notes: "",
      prayerPoints: "",
      base: null,
    });
    expect(clearedAgain).toMatchObject({ status: "saved", deleted: true });
  });

  test("rejects future days, invalid dates, and invalid Bible references", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);

    await expect(
      anna.mutation(api.devotionals.save, {
        date: TOMORROW,
        passage: "Psalm 23",
        notes: "Tomorrow",
        prayerPoints: "",
        base: null,
      })
    ).rejects.toThrow(/Future days/);

    await expect(
      anna.mutation(api.devotionals.save, {
        date: "2026-02-30",
        passage: "Psalm 23",
        notes: "",
        prayerPoints: "",
        base: null,
      })
    ).rejects.toThrow(/Invalid date/);

    await expect(
      anna.mutation(api.devotionals.save, {
        date: "2026-11-20",
        passage: "John 3:99",
        notes: "",
        prayerPoints: "",
        base: null,
      })
    ).rejects.toThrow(/36 verses/);
  });

  test("pages by month and removes devotionals on account wipe", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const ben = asUser(t, BEN);

    await anna.mutation(api.devotionals.save, {
      date: "2026-10-31",
      passage: "Genesis 1",
      notes: "Oct",
      prayerPoints: "",
      base: null,
    });
    await anna.mutation(api.devotionals.save, {
      date: "2026-11-01",
      passage: "Psalm 1",
      notes: "Nov 1",
      prayerPoints: "",
      base: null,
    });
    await anna.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "John 15:1-17",
      notes: "Nov 20",
      prayerPoints: "",
      base: null,
    });
    await ben.mutation(api.devotionals.save, {
      date: "2026-11-20",
      passage: "Romans 8",
      notes: "Ben",
      prayerPoints: "",
      base: null,
    });

    const nov = await anna.query(api.devotionals.byMonth, { year: 2026, month: 11 });
    expect(nov.map((r) => r.date)).toEqual(["2026-11-01", "2026-11-20"]);
    const oct = await anna.query(api.devotionals.byMonth, { year: 2026, month: 10 });
    expect(oct.map((r) => r.date)).toEqual(["2026-10-31"]);

    await expect(anna.query(api.devotionals.byMonth, { year: 2026, month: 13 })).rejects.toThrow(
      /Invalid month/
    );

    const userId = await t.run((ctx) => ctx.db.insert("users", { email: ANNA, name: "Anna" }));
    await t.mutation(internal.account.wipe, { userId });
    const remaining = await t.run((ctx) => ctx.db.query("devotionals").collect());
    expect(remaining.map((r) => r.email)).toEqual([BEN]);
  });

  test("lets someone in Sydney save today just after midnight, but not tomorrow", async () => {
    vi.setSystemTime(Date.UTC(2026, 10, 24, 13, 5));
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const content = { passage: "Psalm 23", notes: "Just after midnight", prayerPoints: "", base: null };
    expect(await anna.mutation(api.devotionals.save, { date: "2026-11-25", ...content })).toMatchObject({
      status: "saved",
      date: "2026-11-25",
    });
    await expect(anna.mutation(api.devotionals.save, { date: "2026-11-26", ...content })).rejects.toThrow(
      /Future days/
    );
  });

  test("refuses a save based on an older copy, and accepts one that matches", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    const date = "2026-11-20";
    const first = await anna.mutation(api.devotionals.save, {
      date,
      passage: "Psalm 23",
      notes: "Phone",
      prayerPoints: "",
      base: null,
    });
    if (first.status !== "saved") throw new Error("expected a save");

    vi.setSystemTime(PINNED_NOW + 60_000);
    const fromLaptop = await anna.mutation(api.devotionals.save, {
      date,
      passage: "Psalm 23",
      notes: "Laptop",
      prayerPoints: "",
      base: first.updatedAt,
    });
    expect(fromLaptop).toMatchObject({ status: "saved", updatedAt: PINNED_NOW + 60_000 });

    const stalePhone = await anna.mutation(api.devotionals.save, {
      date,
      passage: "Psalm 23",
      notes: "Phone again",
      prayerPoints: "",
      base: first.updatedAt,
    });
    expect(stalePhone).toEqual({ status: "conflict", date });
    expect(await anna.query(api.devotionals.byDate, { date })).toMatchObject({ notes: "Laptop" });

    const offlineNew = await anna.mutation(api.devotionals.save, {
      date,
      passage: "",
      notes: "",
      prayerPoints: "",
      base: null,
    });
    expect(offlineNew).toEqual({ status: "conflict", date });

    const sameText = await anna.mutation(api.devotionals.save, {
      date,
      passage: "ps 23",
      notes: "Laptop",
      prayerPoints: "",
      base: null,
    });
    expect(sameText).toMatchObject({ status: "saved", deleted: false, updatedAt: PINNED_NOW + 60_000 });
  });
});
