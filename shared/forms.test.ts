import { describe, expect, test } from "vitest";
import {
  answerForRole,
  answersProblem,
  formatAnswer,
  formatDateTime,
  formatDateTimeRange,
  isValidDateTimeString,
  isValidUrl,
  normalizeAnswers,
  offeredOptions,
  sydneyDateTimeAnswer,
  type FormField,
} from "./forms";

const FIELDS: FormField[] = [
  {
    key: "audience",
    kind: "choice",
    label: "Audience?",
    shortLabel: "Audience",
    required: true,
    options: [
      { value: "internal", label: "Internal" },
      { value: "old", label: "Old", retired: true },
    ],
  },
  { key: "goal", kind: "number", label: "Goal?", shortLabel: "Goal", required: true, max: 500 },
  { key: "start", kind: "dateTime", label: "Start?", shortLabel: "Starts", required: true, notInPast: true, role: "start" },
  { key: "end", kind: "dateTime", label: "End?", shortLabel: "Ends", required: false, notBefore: "start" },
  { key: "open", kind: "dateTime", label: "Open?", shortLabel: "Opens", required: false, notAfter: "start" },
  { key: "link", kind: "url", label: "Link?", shortLabel: "Link", required: false },
  { key: "name", kind: "text", label: "Name?", shortLabel: "Name", required: false, role: "title" },
];

const TODAY = "2026-10-07";
const good = { audience: "internal", goal: 60, start: "2026-11-01T18:00" };

describe("the field kinds event requests added", () => {
  test("normalising keeps a known choice, rounds counts and trims links", () => {
    expect(
      normalizeAnswers(FIELDS, {
        audience: "internal",
        goal: 59.6,
        start: " 2026-11-01T18:00 ",
        link: " https://x.org/sheet ",
      })
    ).toEqual({ audience: "internal", goal: 60, start: "2026-11-01T18:00", link: "https://x.org/sheet" });
    expect(normalizeAnswers(FIELDS, { audience: "nobody", goal: Number.NaN })).toEqual({});
  });

  test("checks choices, counts, date-times and links", () => {
    const problem = (over: Record<string, unknown>, previous?: Record<string, string>) =>
      answersProblem(FIELDS, { ...good, ...over } as never, TODAY, previous);
    expect(problem({})).toBeNull();
    expect(answersProblem(FIELDS, {}, TODAY)).toMatch(/Pick an answer for "Audience"/);
    expect(problem({ goal: undefined })).toMatch(/Enter a number for "Goal"/);
    expect(problem({ goal: -1 })).toMatch(/Enter a number/);
    expect(problem({ goal: 501 })).toBe('"Goal" can be at most 500.');
    expect(problem({ start: undefined })).toMatch(/Pick a date and time/);
    expect(problem({ start: "2026-11-01" })).toMatch(/Pick a date and time/);
    expect(problem({ start: "2026-10-01T09:00" })).toBe('"Starts" can\'t be in the past.');
    expect(problem({ start: "2026-10-01T09:00" }, { start: "2026-10-01T09:00" })).toBeNull();
    expect(problem({ end: "2026-11-01T17:00" })).toBe('"Ends" can\'t be before "Starts".');
    expect(problem({ end: "2026-11-01T21:00" })).toBeNull();
    expect(problem({ open: "2026-11-02T09:00" })).toBe('"Opens" can\'t be after "Starts".');
    expect(problem({ start: "bad", end: "2026-11-01T21:00" }, { start: "bad" })).toMatch(
      /Pick a date and time/
    );
    expect(problem({ link: "www.example.com" })).toMatch(/full link/);
    expect(problem({ link: "https://example.com/a" })).toBeNull();
    expect(answersProblem([{ key: "u", kind: "url", label: "U", shortLabel: "U", required: true }], {}, TODAY)).toMatch(
      /Paste a link/
    );
  });

  test("a retired choice can stay but can't be newly picked", () => {
    expect(offeredOptions(FIELDS[0], []).map((o) => o.value)).toEqual(["internal"]);
    expect(offeredOptions(FIELDS[0], ["old"]).map((o) => o.value)).toEqual(["internal", "old"]);
    expect(answersProblem(FIELDS, { ...good, audience: "old" }, TODAY)).toBe(
      '"Old" is no longer an option for "Audience".'
    );
    expect(answersProblem(FIELDS, { ...good, audience: "old" }, TODAY, { audience: "old" })).toBeNull();
  });

  test("formats choices, counts and date-times", () => {
    const answers = { ...good, goal: 1200, end: "2026-11-01T21:30", link: "https://x.org" };
    expect(formatAnswer(FIELDS[0], answers)).toBe("Internal");
    expect(formatAnswer(FIELDS[1], answers)).toBe("1,200");
    expect(formatAnswer(FIELDS[2], answers)).toBe("1 Nov 2026, 6:00 pm");
    expect(formatAnswer(FIELDS[5], answers)).toBe("https://x.org");
    expect(formatAnswer(FIELDS[0], { audience: "gone" })).toBe("gone");
    expect(formatDateTime("2026-01-12T00:05")).toBe("12 Jan 2026, 12:05 am");
    expect(formatDateTime("2026-01-12T12:00")).toBe("12 Jan 2026, 12:00 pm");
    expect(formatDateTime("nope")).toBe("nope");
    expect(formatDateTimeRange("2026-10-17T11:00", "2026-10-17T17:00")).toBe(
      "17 Oct 2026, 11:00 am – 5:00 pm"
    );
    expect(formatDateTimeRange("2026-01-12T13:00", "2026-01-16T14:00")).toBe(
      "12 Jan 2026, 1:00 pm – 16 Jan 2026, 2:00 pm"
    );
    expect(formatDateTimeRange("2026-01-12T13:00", undefined)).toBe("12 Jan 2026, 1:00 pm");
  });

  test("helpers", () => {
    expect(isValidDateTimeString("2026-02-30T10:00")).toBe(false);
    expect(isValidDateTimeString("2026-02-03T24:00")).toBe(false);
    expect(isValidDateTimeString("2026-02-03T10:00T1")).toBe(false);
    expect(isValidUrl("http://a.b")).toBe(true);
    expect(isValidUrl("ftp://a.b")).toBe(false);
    // 12 Jan 2026 02:00 UTC is 1 pm in Sydney (daylight saving).
    expect(sydneyDateTimeAnswer(Date.UTC(2026, 0, 12, 2, 0))).toBe("2026-01-12T13:00");
    expect(answerForRole(FIELDS, good, "start")).toBe("2026-11-01T18:00");
    expect(answerForRole(FIELDS, { name: "SAF" }, "title")).toBe("SAF");
    expect(answerForRole(FIELDS, {}, "start")).toBe("");
    expect(answerForRole(FIELDS, {}, "location")).toBe("");
  });
});
