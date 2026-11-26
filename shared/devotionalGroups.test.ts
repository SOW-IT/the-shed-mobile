import { describe, expect, test } from "vitest";
import {
  cleanPokeMessage,
  completionTier,
  effectiveSharingLevel,
  firstNameOf,
  formatGroupDateRange,
  highestSharingLevel,
  initialGroupMonth,
  isDateInRange,
  isDevotionalDone,
  MAX_GROUP_NAME_LENGTH,
  MAX_POKE_MESSAGE_LENGTH,
  monthOverlapsRange,
  monthWithinRange,
  pokeCooldownLabel,
  pokeMessageLength,
  sydneyDateTime,
  validateGroupInput,
} from "./devotionalGroups";

describe("devotional group sharing rules", () => {
  test("effectiveSharingLevel takes the lower of group and personal level", () => {
    expect(effectiveSharingLevel("everything", null)).toBe("everything");
    expect(effectiveSharingLevel("passage", undefined)).toBe("passage");
    expect(effectiveSharingLevel("count", null)).toBe("count");

    expect(effectiveSharingLevel("everything", "count")).toBe("count");
    expect(effectiveSharingLevel("everything", "passage")).toBe("passage");
    expect(effectiveSharingLevel("everything", "everything")).toBe("everything");

    expect(effectiveSharingLevel("passage", "everything")).toBe("passage");
    expect(effectiveSharingLevel("passage", "passage")).toBe("passage");
    expect(effectiveSharingLevel("passage", "count")).toBe("count");

    expect(effectiveSharingLevel("count", "everything")).toBe("count");
    expect(effectiveSharingLevel("count", "passage")).toBe("count");
    expect(effectiveSharingLevel("count", "count")).toBe("count");
  });

  test("highestSharingLevel picks the most permissive level", () => {
    expect(highestSharingLevel([])).toBeNull();
    expect(highestSharingLevel(["count"])).toBe("count");
    expect(highestSharingLevel(["count", "passage"])).toBe("passage");
    expect(highestSharingLevel(["count", "everything", "passage"])).toBe("everything");
  });

  test("isDevotionalDone requires a non-blank passage", () => {
    expect(isDevotionalDone(null)).toBe(false);
    expect(isDevotionalDone(undefined)).toBe(false);
    expect(isDevotionalDone({ passage: "" })).toBe(false);
    expect(isDevotionalDone({ passage: "   " })).toBe(false);
    expect(isDevotionalDone({ passage: "Psalm 23" })).toBe(true);
  });
});

describe("devotional group validation and dates", () => {
  test("validates name, date range and sharing level", () => {
    expect(
      validateGroupInput({
        name: "  Morning Crew  ",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "passage",
      })
    ).toEqual({
      ok: true,
      normalized: {
        name: "Morning Crew",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "passage",
      },
    });
    expect(
      validateGroupInput({
        name: "   ",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      }).ok
    ).toBe(false);
    expect(
      validateGroupInput({
        name: "a".repeat(MAX_GROUP_NAME_LENGTH + 1),
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "count",
      }).ok
    ).toBe(false);
    expect(
      validateGroupInput({
        name: "Crew",
        startDate: "2026-02-30",
        endDate: "2026-11-30",
        sharingLevel: "count",
      }).ok
    ).toBe(false);
    expect(
      validateGroupInput({
        name: "Crew",
        startDate: "2026-11-30",
        endDate: "2026-11-01",
        sharingLevel: "count",
      }).ok
    ).toBe(false);
    expect(
      validateGroupInput({
        name: "Crew",
        startDate: "2026-11-01",
        endDate: "2026-11-30",
        sharingLevel: "invalid",
      }).ok
    ).toBe(false);
  });

  test("checks date ranges, month clamping and formatting", () => {
    expect(isDateInRange("2026-11-15", "2026-11-01", "2026-11-30")).toBe(true);
    expect(isDateInRange("2026-10-31", "2026-11-01", "2026-11-30")).toBe(false);
    expect(isDateInRange("2026-12-01", "2026-11-01", "2026-11-30")).toBe(false);

    expect(initialGroupMonth("2026-11-15", "2026-11-01", "2026-12-31")).toEqual({ year: 2026, month: 11 });
    expect(initialGroupMonth("2026-10-15", "2026-11-01", "2026-12-31")).toEqual({ year: 2026, month: 11 });
    expect(initialGroupMonth("2027-01-15", "2026-11-01", "2026-12-31")).toEqual({ year: 2026, month: 12 });

    expect(monthWithinRange(2026, 11, "2026-11-01", "2026-12-31")).toEqual({ hasPrev: false, hasNext: true });
    expect(monthWithinRange(2026, 12, "2026-11-01", "2026-12-31")).toEqual({ hasPrev: true, hasNext: false });

    expect(formatGroupDateRange("2026-11-01", "2026-11-01")).toBe("1 Nov 2026");
    expect(formatGroupDateRange("2026-11-01", "2026-11-30")).toBe("1 Nov - 30 Nov 2026");
    expect(formatGroupDateRange("2026-12-20", "2027-01-10")).toBe("20 Dec 2026 - 10 Jan 2027");
  });

  test("extracts first name and maps completion tiers", () => {
    expect(firstNameOf("Daniel Kim")).toBe("Daniel");
    expect(firstNameOf("  ")).toBe("Someone");
    expect(firstNameOf(null)).toBe("Someone");

    expect(completionTier(0, 5, true)).toBe("neutral");
    expect(completionTier(0, 0, false)).toBe("neutral");
    expect(completionTier(0, 5, false)).toBe("zero");
    expect(completionTier(2, 5, false)).toBe("low");
    expect(completionTier(3, 5, false)).toBe("mid");
    expect(completionTier(4, 5, false)).toBe("high");
    expect(completionTier(5, 5, false)).toBe("full");
  });

  test("computes Sydney date and hour across AEST and AEDT", () => {
    expect(sydneyDateTime(Date.UTC(2026, 6, 15, 10, 1))).toEqual({
      date: "2026-07-15",
      hour: 20,
      minute: 1,
    });
    expect(sydneyDateTime(Date.UTC(2026, 6, 15, 9, 1))).toEqual({
      date: "2026-07-15",
      hour: 19,
      minute: 1,
    });
    expect(sydneyDateTime(Date.UTC(2026, 10, 25, 9, 1))).toEqual({
      date: "2026-11-25",
      hour: 20,
      minute: 1,
    });
    expect(sydneyDateTime(Date.UTC(2026, 10, 25, 10, 1))).toEqual({
      date: "2026-11-25",
      hour: 21,
      minute: 1,
    });
  });
});

test("a browsed month stays only while it overlaps the group's dates", () => {
  expect(monthOverlapsRange(2026, 11, "2026-11-20", "2027-01-05")).toBe(true);
  expect(monthOverlapsRange(2027, 1, "2026-11-20", "2027-01-05")).toBe(true);
  expect(monthOverlapsRange(2026, 10, "2026-11-20", "2027-01-05")).toBe(false);
  expect(monthOverlapsRange(2027, 2, "2026-11-20", "2027-01-05")).toBe(false);
});

describe("devotional group poke helpers", () => {
  test("cleanPokeMessage trims, collapses whitespace, allows blank, and enforces max length", () => {
    expect(cleanPokeMessage(undefined)).toEqual({ ok: true, message: null });
    expect(cleanPokeMessage("   \n\t  ")).toEqual({ ok: true, message: null });
    expect(cleanPokeMessage("  Time   for\n  devos!  ")).toEqual({
      ok: true,
      message: "Time for devos!",
    });
    expect(cleanPokeMessage("a".repeat(MAX_POKE_MESSAGE_LENGTH))).toEqual({
      ok: true,
      message: "a".repeat(MAX_POKE_MESSAGE_LENGTH),
    });
    expect(cleanPokeMessage("a".repeat(MAX_POKE_MESSAGE_LENGTH + 1))).toEqual({
      ok: false,
      error: `Message can be at most ${MAX_POKE_MESSAGE_LENGTH} characters.`,
    });
    // Unicode surrogate pairs count as single code points.
    expect(cleanPokeMessage("🙏".repeat(MAX_POKE_MESSAGE_LENGTH)).ok).toBe(true);
    expect(cleanPokeMessage("🙏".repeat(MAX_POKE_MESSAGE_LENGTH + 1)).ok).toBe(false);
  });

  test("pokeCooldownLabel rounds up to at least 1 min", () => {
    expect(pokeCooldownLabel(0)).toBe("1 min");
    expect(pokeCooldownLabel(500)).toBe("1 min");
    expect(pokeCooldownLabel(60_000)).toBe("1 min");
    expect(pokeCooldownLabel(60_001)).toBe("2 min");
    expect(pokeCooldownLabel(60 * 60_000)).toBe("60 min");
  });

  test("pokeMessageLength counts code points of the normalized message", () => {
    expect(pokeMessageLength("")).toBe(0);
    expect(pokeMessageLength("  hi \n\n there  ")).toBe(8);
    expect(pokeMessageLength("🙏🙏")).toBe(2);
  });
});
