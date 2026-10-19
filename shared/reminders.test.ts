import { describe, expect, it } from "vitest";
import {
  daysBetweenYmd,
  dueText,
  eventTimingText,
  forDays,
  plural,
  reminderDelayMs,
  reminderDue,
  reminderSubject,
  summarizeWaiting,
} from "./reminders";

const DAY = 86_400_000;

describe("reminderDelayMs", () => {
  it("waits a day, then three, then a week", () => {
    expect(reminderDelayMs(0)).toBe(DAY);
    expect(reminderDelayMs(1)).toBe(3 * DAY);
    expect(reminderDelayMs(2)).toBe(7 * DAY);
    expect(reminderDelayMs(9)).toBe(7 * DAY);
  });
});

describe("reminderDue", () => {
  const moved = 1_000_000 * DAY;

  it("is not due within a day of the last movement", () => {
    expect(reminderDue({}, moved, moved + DAY - 1)).toEqual({ due: false, count: 0, days: 0 });
  });

  it("is due a day after movement with no reminder yet", () => {
    expect(reminderDue({}, moved, moved + DAY)).toEqual({ due: true, count: 0, days: 1 });
  });

  it("counts an old reminder with no count as one", () => {
    const trail = { lastReminderAt: moved + DAY };
    expect(reminderDue(trail, moved, moved + 2 * DAY)).toMatchObject({ due: false, count: 1 });
    expect(reminderDue(trail, moved, moved + 4 * DAY)).toMatchObject({ due: true, count: 1 });
  });

  it("starts over once the item moves after a reminder", () => {
    const trail = { lastReminderAt: moved + DAY, reminderCount: 3 };
    const movedAgain = moved + 2 * DAY;
    expect(reminderDue(trail, movedAgain, movedAgain + DAY)).toEqual({
      due: true,
      count: 0,
      days: 1,
    });
  });

  it("measures the weekly tier from the last reminder", () => {
    const trail = { lastReminderAt: moved + 4 * DAY, reminderCount: 2 };
    expect(reminderDue(trail, moved, moved + 10 * DAY)).toMatchObject({ due: false, count: 2 });
    expect(reminderDue(trail, moved, moved + 11 * DAY)).toMatchObject({
      due: true,
      count: 2,
      days: 11,
    });
  });
});

describe("wording", () => {
  it("pluralises and says how long", () => {
    expect(plural(1, "day")).toBe("1 day");
    expect(plural(2, "day")).toBe("2 days");
    expect(plural(1, "thing is", "things are")).toBe("1 thing is");
    expect(forDays(0)).toBe("since today");
    expect(forDays(1)).toBe("for 1 day");
    expect(forDays(5)).toBe("for 5 days");
  });

  it("counts days between dates and rejects bad ones", () => {
    expect(daysBetweenYmd("2026-10-19", "2026-10-22")).toBe(3);
    expect(daysBetweenYmd("2026-10-19", "2026-10-18")).toBe(-1);
    expect(daysBetweenYmd("2026-03-31", "2026-04-01")).toBe(1);
    expect(daysBetweenYmd("nope", "2026-10-18")).toBeNull();
    expect(daysBetweenYmd("2026-10-18", "")).toBeNull();
  });

  it("describes a due date relative to today", () => {
    expect(dueText("2026-10-23", "2026-10-19")).toBe("needed by 23 Oct 2026 (in 4 days)");
    expect(dueText("2026-10-20", "2026-10-19")).toBe("needed by 20 Oct 2026 (tomorrow)");
    expect(dueText("2026-10-19", "2026-10-19")).toBe("needed by 19 Oct 2026 (today)");
    expect(dueText("2026-10-18", "2026-10-19")).toBe("needed by 18 Oct 2026 (overdue by 1 day)");
    expect(dueText("2026-10-10", "2026-10-19")).toBe("needed by 10 Oct 2026 (overdue by 9 days)");
    expect(dueText("", "2026-10-19")).toBe("");
  });

  it("describes when the event is", () => {
    expect(eventTimingText("2026-11-01T18:00", "2026-10-19")).toBe("the event is in 13 days");
    expect(eventTimingText("2026-10-20T18:00", "2026-10-19")).toBe("the event is tomorrow");
    expect(eventTimingText("2026-10-19T18:00", "2026-10-19")).toBe("the event is today");
    expect(eventTimingText("2026-10-17T18:00", "2026-10-19")).toBe("the event was 2 days ago");
    expect(eventTimingText("2026-10-18T18:00", "2026-10-19")).toBe("the event was 1 day ago");
    expect(eventTimingText("soon", "2026-10-19")).toBe("");
    expect(eventTimingText("2026-10-18T18:00", "today")).toBe("");
  });

  it("summarises what is waiting", () => {
    expect(summarizeWaiting({})).toBe("Nothing is waiting on you.");
    expect(summarizeWaiting({ design: 0 })).toBe("Nothing is waiting on you.");
    expect(summarizeWaiting({ reimbursement: 1 })).toBe(
      "1 reimbursement request is waiting on you."
    );
    expect(summarizeWaiting({ reimbursement: 2, event: 1 })).toBe(
      "2 reimbursement requests and 1 event form are waiting on you."
    );
    expect(summarizeWaiting({ reimbursement: 1, design: 2, event: 3 })).toBe(
      "1 reimbursement request, 2 design requests and 3 event forms are waiting on you."
    );
  });

  it("writes the email subject", () => {
    expect(reminderSubject(1)).toBe("Reminder: 1 thing is waiting on you in THE SHED");
    expect(reminderSubject(4)).toBe("Reminder: 4 things are waiting on you in THE SHED");
  });
});
