import { describe, expect, test } from "vitest";
import { auditHeadline, CALENDAR_AUDIT_ACTIONS, entryChanges, entryWhen, NOTES_SHOWN } from "./calendarAudit";

const at = (iso: string) => Date.parse(iso);
const MEETING = { name: "Meeting", dateStart: at("2026-12-03T06:00:00Z"), dateEnd: at("2026-12-03T08:00:00Z") };

describe("entryWhen", () => {
  test("an event on one day, across days, and a deadline due on a day or at a time", () => {
    expect(entryWhen(MEETING)).toBe("Thu, 3 Dec 2026, 5:00 pm to 7:00 pm");
    expect(entryWhen({ ...MEETING, dateEnd: at("2026-12-05T01:00:00Z") })).toBe(
      "Thu, 3 Dec 2026, 5:00 pm to Sat, 5 Dec 2026, 12:00 pm"
    );
    expect(entryWhen({ ...MEETING, dateEnd: MEETING.dateStart, due: "day" })).toBe("Due Thu, 3 Dec 2026");
    expect(entryWhen({ ...MEETING, dateEnd: MEETING.dateStart, due: "time" })).toBe("Due Thu, 3 Dec 2026, 5:00 pm");
  });
});

describe("entryChanges", () => {
  test("lists only the fields that changed, before and after", () => {
    expect(entryChanges(MEETING, { ...MEETING })).toEqual([]);
    expect(
      entryChanges(MEETING, {
        ...MEETING,
        dateEnd: MEETING.dateStart,
        due: "day",
        notes: "Bring posters",
        colour: "blue",
      })
    ).toEqual([
      { field: "Type", from: "Event", to: "Deadline" },
      { field: "When", from: "Thu, 3 Dec 2026, 5:00 pm to 7:00 pm", to: "Due Thu, 3 Dec 2026" },
      { field: "Notes", from: "none", to: "Bring posters" },
      { field: "Colour", from: "category colour", to: "blue" },
    ]);
  });

  test("long notes are cut short, and an edit past the cut still shows", () => {
    const long = "a".repeat(NOTES_SHOWN + 20);
    const [change] = entryChanges(MEETING, { ...MEETING, notes: long });
    expect(change.to).toHaveLength(NOTES_SHOWN);
    expect(change.to.endsWith("…")).toBe(true);
    const emoji = `${"a".repeat(NOTES_SHOWN - 2)}🎉🎉🎉`;
    const [cut] = entryChanges(MEETING, { ...MEETING, notes: emoji });
    expect(cut.to).toBe(`${"a".repeat(NOTES_SHOWN - 2)}🎉…`);
    expect(cut.to.isWellFormed()).toBe(true);
    expect(entryChanges({ ...MEETING, notes: long }, { ...MEETING, notes: `${long}b` })).toEqual([
      { field: "Notes", from: "earlier notes", to: "edited notes" },
    ]);
  });
});

describe("auditHeadline", () => {
  test("says what was done", () => {
    expect(CALENDAR_AUDIT_ACTIONS.map((action) => auditHeadline(action, "Camp"))).toEqual([
      "Added Camp",
      "Edited Camp",
      "Deleted Camp",
      "Turned Camp into an attendance event",
    ]);
  });
});
