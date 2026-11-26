import { describe, expect, test } from "vitest";
import {
  earliestTodayDevotionalDate,
  EMPTY_DEVOTIONAL,
  hasDevotionalContent,
  isFutureDevotionalDate,
  latestDevotionalDate,
  MAX_NOTES_LENGTH,
  MAX_PASSAGE_LENGTH,
  MAX_PRAYER_LENGTH,
  mergeMonthDevotionals,
  monthBounds,
  parseDraftStore,
  pickDisplayDevotional,
  todayDevotionalDate,
  validateDevotionalDate,
  validateDevotionalInput,
  validateDevotionalMonth,
  validateTodayDevotionalDate,
} from "./devotionals";

describe("devotional date rules", () => {
  const today = "2026-11-24";

  test("allows today and past days, rejects future days and malformed dates", () => {
    expect(isFutureDevotionalDate("2026-11-24", today)).toBe(false);
    expect(isFutureDevotionalDate("2026-11-23", today)).toBe(false);
    expect(isFutureDevotionalDate("2026-11-25", today)).toBe(true);

    expect(validateDevotionalDate("2026-11-24", today)).toEqual({ ok: true, date: "2026-11-24" });
    expect(validateDevotionalDate("2026-10-01", today)).toEqual({ ok: true, date: "2026-10-01" });
    expect(validateDevotionalDate("2026-11-25", today).ok).toBe(false);
    expect(validateDevotionalDate("2027-01-01", today).ok).toBe(false);
    expect(validateDevotionalDate("2026-02-29", today).ok).toBe(false);
    expect(validateDevotionalDate("not-a-date", today).ok).toBe(false);
    expect(validateDevotionalDate(null, today).ok).toBe(false);
  });

  test("today is the phone's own date, and the server allows the latest date anywhere", () => {
    const now = new Date(2026, 10, 25, 0, 5).getTime();
    expect(todayDevotionalDate(now)).toBe("2026-11-25");
    expect(todayDevotionalDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(latestDevotionalDate(Date.UTC(2026, 10, 24, 13, 5))).toBe("2026-11-25");
    expect(latestDevotionalDate(Date.UTC(2026, 10, 24, 9, 59))).toBe("2026-11-24");
    expect(latestDevotionalDate(Date.UTC(2026, 10, 24, 10, 0))).toBe("2026-11-25");
  });

  test("today's date must be today somewhere on Earth", () => {
    const now = Date.UTC(2026, 10, 25, 2, 0);
    expect(earliestTodayDevotionalDate(now)).toBe("2026-11-24");
    expect(earliestTodayDevotionalDate(Date.UTC(2026, 10, 25, 12, 0))).toBe("2026-11-25");
    expect(validateTodayDevotionalDate("2026-11-24", now)).toEqual({ ok: true, date: "2026-11-24" });
    expect(validateTodayDevotionalDate("2026-11-25", now)).toEqual({ ok: true, date: "2026-11-25" });
    expect(validateTodayDevotionalDate("2026-11-23", now).ok).toBe(false);
    expect(validateTodayDevotionalDate("2026-11-26", now).ok).toBe(false);
    expect(validateTodayDevotionalDate("2026-02-30", now)).toEqual({ ok: false, error: "Invalid date." });
    expect(validateTodayDevotionalDate(undefined, now).ok).toBe(false);
  });

  test("computes month bounds", () => {
    expect(monthBounds(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds(2024, 2)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthBounds(2026, 11)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(validateDevotionalMonth(2026, 11)).toBe(true);
    expect(validateDevotionalMonth(2026, 0)).toBe(false);
    expect(validateDevotionalMonth(2026, 13)).toBe(false);
    expect(validateDevotionalMonth(1969, 5)).toBe(false);
    expect(validateDevotionalMonth(2026.5, 5)).toBe(false);
  });
});

describe("devotional validation and merging", () => {
  test("validates passage, notes and prayer", () => {
    expect(
      validateDevotionalInput({ passage: "ps 23", notes: "Good shepherd", prayerPoints: "Peace" })
    ).toEqual({
      ok: true,
      normalized: { passage: "Psalm 23", notes: "Good shepherd", prayerPoints: "Peace" },
    });
    expect(validateDevotionalInput({ passage: "", notes: "", prayerPoints: "" })).toEqual({
      ok: true,
      normalized: { passage: "", notes: "", prayerPoints: "" },
    });
    expect(
      validateDevotionalInput({ passage: "BadBook 1", notes: "", prayerPoints: "" }).ok
    ).toBe(false);
    expect(
      validateDevotionalInput({
        passage: "A".repeat(MAX_PASSAGE_LENGTH + 1),
        notes: "",
        prayerPoints: "",
      }).ok
    ).toBe(false);
    const shortButLong = Array.from({ length: 20 }, () => "Ps 1").join("; ");
    expect(shortButLong.length).toBeLessThanOrEqual(MAX_PASSAGE_LENGTH);
    expect(validateDevotionalInput({ passage: shortButLong, notes: "", prayerPoints: "" })).toEqual({
      ok: false,
      error: `Passage can be at most ${MAX_PASSAGE_LENGTH} characters.`,
    });
    expect(
      validateDevotionalInput({
        passage: "",
        notes: "x".repeat(MAX_NOTES_LENGTH + 1),
        prayerPoints: "",
      }).ok
    ).toBe(false);
    expect(
      validateDevotionalInput({
        passage: "",
        notes: "",
        prayerPoints: "x".repeat(MAX_PRAYER_LENGTH + 1),
      }).ok
    ).toBe(false);
  });

  test("checks content presence, parses draft stores and merges month records", () => {
    expect(hasDevotionalContent(EMPTY_DEVOTIONAL)).toBe(false);
    expect(hasDevotionalContent({ passage: "Psalm 23", notes: "", prayerPoints: "" })).toBe(true);
    expect(hasDevotionalContent({ passage: "", notes: "Hi", prayerPoints: "" })).toBe(true);
    expect(hasDevotionalContent({ passage: "", notes: "", prayerPoints: "Lord" })).toBe(true);

    expect(parseDraftStore("not json")).toEqual({});
    expect(parseDraftStore("[]")).toEqual({});
    expect(
      parseDraftStore(
        JSON.stringify({
          "2026-11-24": {
            passage: "Psalm 23",
            notes: "n",
            prayerPoints: "p",
            updatedAt: 100,
            dirty: true,
            base: 90,
            conflict: true,
          },
          "2026-11-21": { passage: "", notes: "n", prayerPoints: "", updatedAt: 5, dirty: false, conflict: true },
          "bad-date": { passage: "", notes: "", prayerPoints: "", updatedAt: 100, dirty: false },
          "2026-11-23": { passage: 123 },
          "2026-11-22": null,
        })
      )
    ).toEqual({
      "2026-11-24": {
        date: "2026-11-24",
        passage: "Psalm 23",
        notes: "n",
        prayerPoints: "p",
        updatedAt: 100,
        dirty: true,
        base: 90,
        conflict: true,
      },
      "2026-11-21": {
        date: "2026-11-21",
        passage: "",
        notes: "n",
        prayerPoints: "",
        updatedAt: 5,
        dirty: false,
        base: null,
        conflict: false,
      },
    });

    const remote = {
      date: "2026-11-24",
      passage: "Psalm 23",
      notes: "remote",
      prayerPoints: "",
      updatedAt: 200,
    };
    const dirtyLocal = { ...remote, notes: "local", updatedAt: 150, dirty: true, base: 100, conflict: false };
    const cleanOlderLocal = { ...remote, notes: "old", updatedAt: 100, dirty: false, base: 100, conflict: false };
    const cleanNewerLocal = { ...cleanOlderLocal, updatedAt: 300 };
    expect(pickDisplayDevotional(dirtyLocal, remote).notes).toBe("local");
    expect(pickDisplayDevotional(cleanOlderLocal, remote).notes).toBe("remote");
    expect(pickDisplayDevotional(cleanNewerLocal, remote).notes).toBe("remote");
    expect(pickDisplayDevotional(cleanNewerLocal, null)).toEqual(EMPTY_DEVOTIONAL);
    expect(pickDisplayDevotional(dirtyLocal, null).notes).toBe("local");
    expect(pickDisplayDevotional(cleanOlderLocal, undefined).notes).toBe("old");
    expect(pickDisplayDevotional(undefined, remote).notes).toBe("remote");
    expect(pickDisplayDevotional(undefined, null)).toEqual(EMPTY_DEVOTIONAL);
    expect(pickDisplayDevotional(undefined, undefined)).toEqual(EMPTY_DEVOTIONAL);

    const merged = mergeMonthDevotionals(
      [
        remote,
        { date: "2026-11-20", passage: "John 1", notes: "", prayerPoints: "", updatedAt: 50 },
        { date: "2026-10-31", passage: "Gen 1", notes: "", prayerPoints: "", updatedAt: 50 },
      ],
      {
        "2026-11-24": cleanOlderLocal,
        "2026-11-20": {
          date: "2026-11-20",
          passage: "",
          notes: "",
          prayerPoints: "",
          updatedAt: 60,
          dirty: true,
          base: 50,
          conflict: false,
        },
        "2026-11-21": {
          date: "2026-11-21",
          passage: "Mark 1",
          notes: "",
          prayerPoints: "",
          updatedAt: 70,
          dirty: true,
          base: null,
          conflict: false,
        },
        "2026-12-01": {
          date: "2026-12-01",
          passage: "Luke 1",
          notes: "",
          prayerPoints: "",
          updatedAt: 80,
          dirty: true,
          base: null,
          conflict: false,
        },
      },
      2026,
      11
    );
    expect(merged.get("2026-11-24")?.notes).toBe("remote");
    expect(merged.has("2026-11-20")).toBe(false);
    expect(merged.get("2026-11-21")?.passage).toBe("Mark 1");
    expect(merged.has("2026-10-31")).toBe(false);
    expect(merged.has("2026-12-01")).toBe(false);

    const deletedElsewhere = { ...cleanNewerLocal, date: "2026-11-18" };
    const loaded = mergeMonthDevotionals([], { "2026-11-18": deletedElsewhere }, 2026, 11);
    expect(loaded.has("2026-11-18")).toBe(false);
    const notLoaded = mergeMonthDevotionals(undefined, { "2026-11-18": deletedElsewhere }, 2026, 11);
    expect(notLoaded.get("2026-11-18")?.notes).toBe("old");
  });
});
