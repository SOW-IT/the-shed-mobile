import { describe, expect, it } from "vitest";
import {
  addDaysToDateInputValue,
  compactAgo,
  pad2,
  parseDateInputValue,
  parseDateTimeInputValues,
  parseTimeInputValue,
  toDateInputValue,
  timeAgo,
  toTimeInputValue,
} from "./datetime";

describe("pad2", () => {
  it("pads single digits and leaves wider values alone", () => {
    expect(pad2(0)).toBe("00");
    expect(pad2(7)).toBe("07");
    expect(pad2(12)).toBe("12");
    expect(pad2(2024)).toBe("2024");
  });
});

describe("toDateInputValue / toTimeInputValue", () => {
  it("writes the local calendar day and wall clock zero-padded", () => {
    const d = new Date(2024, 5, 9, 7, 4);
    expect(toDateInputValue(d)).toBe("2024-06-09");
    expect(toTimeInputValue(d)).toBe("07:04");
  });

  it("keeps two-digit parts as-is", () => {
    const d = new Date(2024, 10, 24, 17, 30);
    expect(toDateInputValue(d)).toBe("2024-11-24");
    expect(toTimeInputValue(d)).toBe("17:30");
  });
});

describe("parseDateInputValue", () => {
  it("round-trips a formatted value to local midnight", () => {
    const parsed = parseDateInputValue("2024-06-09");
    expect(parsed).not.toBeNull();
    expect(toDateInputValue(parsed!)).toBe("2024-06-09");
    expect(parsed!.getHours()).toBe(0);
    expect(parsed!.getMinutes()).toBe(0);
  });

  it("rejects empty, malformed and unpadded values", () => {
    expect(parseDateInputValue("")).toBeNull();
    expect(parseDateInputValue("not a date")).toBeNull();
    expect(parseDateInputValue("2024-6-9")).toBeNull();
    expect(parseDateInputValue("2024-06-09T10:00")).toBeNull();
  });

  it("rejects a day that doesn't exist rather than rolling it over", () => {
    expect(parseDateInputValue("2024-02-31")).toBeNull();
    expect(parseDateInputValue("2023-02-29")).toBeNull();
    expect(parseDateInputValue("0000-00-00")).toBeNull();
    expect(parseDateInputValue("2024-02-29")).not.toBeNull();
  });

  it("reads a year literally, so early years round-trip", () => {
    const parsed = parseDateInputValue("0099-01-01");
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(99);
    expect(toDateInputValue(parsed!)).toBe("0099-01-01");
  });

  it("round-trips whatever toDateInputValue emits", () => {
    const early = new Date(0);
    early.setFullYear(99, 0, 1);
    early.setHours(0, 0, 0, 0);
    for (const date of [new Date(2024, 5, 9), new Date(2026, 11, 31), early]) {
      expect(parseDateInputValue(toDateInputValue(date))?.getTime()).toBe(
        date.getTime()
      );
    }
  });
});

describe("parseTimeInputValue", () => {
  it("accepts padded and unpadded hours", () => {
    expect(parseTimeInputValue("07:04")).toEqual({ hours: 7, minutes: 4 });
    expect(parseTimeInputValue("7:04")).toEqual({ hours: 7, minutes: 4 });
    expect(parseTimeInputValue("00:00")).toEqual({ hours: 0, minutes: 0 });
    expect(parseTimeInputValue("23:59")).toEqual({ hours: 23, minutes: 59 });
  });

  it("rejects malformed and out-of-range values", () => {
    expect(parseTimeInputValue("")).toBeNull();
    expect(parseTimeInputValue("17")).toBeNull();
    expect(parseTimeInputValue("17:5")).toBeNull();
    expect(parseTimeInputValue("24:00")).toBeNull();
    expect(parseTimeInputValue("12:60")).toBeNull();
  });
});

describe("parseDateTimeInputValues", () => {
  it("combines the two field values into a local timestamp", () => {
    const ms = parseDateTimeInputValues("2024-06-09", "17:30");
    expect(ms).not.toBeNull();
    expect(new Date(ms!)).toEqual(new Date(2024, 5, 9, 17, 30, 0, 0));
  });

  it("is null when either half is unusable", () => {
    expect(parseDateTimeInputValues("2024-6-9", "17:30")).toBeNull();
    expect(parseDateTimeInputValues("2024-06-09", "17")).toBeNull();
  });

  it("moves a DST-skipped wall-clock time forward rather than rejecting it", () => {
    const ms = parseDateTimeInputValues("2026-10-04", "02:30");
    expect(ms).not.toBeNull();
    const at = new Date(ms!);
    const midnight = new Date(2026, 9, 4);
    const skipped =
      midnight.getTimezoneOffset() !==
      new Date(2026, 9, 5).getTimezoneOffset();
    expect(at.getHours()).toBe(skipped ? 3 : 2);
    expect(at.getMinutes()).toBe(30);
  });
});

describe("compactAgo", () => {
  const now = new Date(2024, 5, 20, 12, 0).getTime();
  const agoBy = (ms: number) => compactAgo(now - ms, now);

  it("counts up through minutes, hours and days", () => {
    expect(agoBy(0)).toBe("now");
    expect(agoBy(59_000)).toBe("now");
    expect(agoBy(60_000)).toBe("1m");
    expect(agoBy(59 * 60_000)).toBe("59m");
    expect(agoBy(60 * 60_000)).toBe("1h");
    expect(agoBy(23 * 60 * 60_000)).toBe("23h");
    expect(agoBy(24 * 60 * 60_000)).toBe("1d");
    expect(agoBy(6 * 24 * 60 * 60_000)).toBe("6d");
  });

  it("switches to an absolute date once a week old", () => {
    const stamp = agoBy(7 * 24 * 60 * 60_000);
    expect(stamp).not.toMatch(/^\d+[mhd]$/);
    expect(stamp.length).toBeGreaterThan(0);
  });

  it("defaults `now` to the current time", () => {
    expect(compactAgo(Date.now())).toBe("now");
  });
});

describe("addDaysToDateInputValue", () => {
  it("moves by calendar days across month and year ends", () => {
    expect(addDaysToDateInputValue("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateInputValue("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateInputValue("2026-10-12", -2)).toBe("2026-10-10");
  });

  it("crosses the October daylight-saving change without skipping a day", () => {
    expect(addDaysToDateInputValue("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDaysToDateInputValue("2026-10-04", 1)).toBe("2026-10-05");
  });

  it("returns null for a value it can't read", () => {
    expect(addDaysToDateInputValue("", 1)).toBeNull();
  });
});

describe("timeAgo", () => {
  const now = new Date(2026, 9, 9, 12, 0).getTime();
  const agoBy = (ms: number) => timeAgo(now - ms, now);
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;

  it("counts up from just now to years", () => {
    expect(agoBy(0)).toBe("just now");
    expect(agoBy(59_000)).toBe("just now");
    expect(agoBy(MIN)).toBe("1m ago");
    expect(agoBy(59 * MIN)).toBe("59m ago");
    expect(agoBy(60 * MIN)).toBe("1h ago");
    expect(agoBy(DAY)).toBe("1d ago");
    expect(agoBy(7 * DAY)).toBe("1w ago");
    expect(agoBy(34 * DAY)).toBe("4w ago");
    expect(agoBy(35 * DAY)).toBe("1mo ago");
    expect(agoBy(359 * DAY)).toBe("11mo ago");
    expect(agoBy(360 * DAY)).toBe("1y ago");
  });
});
