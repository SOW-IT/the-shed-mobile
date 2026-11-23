import { describe, expect, test } from "vitest";
import {
  announcementEmail,
  announcementPath,
  audienceSummary,
  cleanDraft,
  cleanEmails,
  emailChoiceOf,
  emailDeliverySummary,
  emailFlags,
  emailRecipients,
  EVERYONE,
  inAudience,
  isEveryone,
  MESSAGE_MAX,
  missesSomeone,
  nameList,
  personMatches,
  rateLimitError,
  scheduleError,
  sortRoles,
  withAll,
  withoutAll,
} from "./announcements";

const MINUTE = 60_000;
const NOW = 1_800_000_000_000;
const divisionOf = (department: string) =>
  ({ Finance: "Governance", Events: "Operations" })[department];

describe("inAudience", () => {
  test("everyone reaches people with no assignments too", () => {
    expect(isEveryone(EVERYONE)).toBe(true);
    expect(inAudience([], EVERYONE, divisionOf)).toBe(true);
    expect(inAudience([], { ...EVERYONE, roles: ["Staff"] }, divisionOf)).toBe(false);
  });

  test("a chosen division reaches its heads and its departments' staff", () => {
    const governance = { ...EVERYONE, divisions: ["Governance"] };
    expect(inAudience([{ role: "Staff", department: "Finance" }], governance, divisionOf)).toBe(true);
    expect(inAudience([{ role: "Head of Division", division: "Governance" }], governance, divisionOf)).toBe(true);
    expect(inAudience([{ role: "Staff", department: "Events" }], governance, divisionOf)).toBe(false);
    expect(inAudience([{ role: "Staff", department: "Unknown" }], governance, divisionOf)).toBe(false);
  });

  test("a role has to be on the same assignment as the group", () => {
    const luke = [
      { role: "Student Leader", university: "UNSW" },
      { role: "Staff", department: "Events" },
    ];
    expect(inAudience(luke, { ...EVERYONE, campuses: ["UNSW"], roles: ["Student Leader"] }, divisionOf)).toBe(true);
    expect(inAudience(luke, { ...EVERYONE, campuses: ["UNSW"], roles: ["Staff"] }, divisionOf)).toBe(false);
    expect(inAudience(luke, { ...EVERYONE, departments: ["Events"] }, divisionOf)).toBe(true);
    expect(inAudience([{ role: "Director" }], { ...EVERYONE, campuses: ["UNSW"] }, divisionOf)).toBe(false);
  });
});

test("audienceSummary names the groups, then the roles", () => {
  expect(audienceSummary(EVERYONE)).toBe("All leaders");
  expect(
    audienceSummary({
      campuses: ["University of New South Wales"],
      divisions: ["Governance"],
      departments: ["Events"],
      roles: [],
    })
  ).toBe("UNSW, Governance, Events");
  expect(audienceSummary({ ...EVERYONE, roles: ["Head of Department", "Staff"] })).toBe(
    "HOD, Staff"
  );
});

test("sortRoles follows the app's role order, then A–Z, without repeats", () => {
  expect(sortRoles(["Zeta", "Staff", "Director", "Alpha", "Staff"])).toEqual([
    "Staff",
    "Director",
    "Alpha",
    "Zeta",
  ]);
});

test("cleanDraft trims and checks the lengths", () => {
  expect(cleanDraft({ title: " Hi ", message: " There " })).toEqual({ title: "Hi", message: "There" });
  expect(cleanDraft({ title: "Hi", message: "x".repeat(MESSAGE_MAX + 1) })).toEqual({
    error: "Keep the message to 1000 characters.",
  });
});

describe("rateLimitError", () => {
  const draft = { title: "Hello", message: "World" };
  const sent = (minutesAgo: number, title = "Other") => ({
    createdAt: NOW - minutesAgo * MINUTE,
    title,
    message: "World",
  });

  test("allows a first send", () => {
    expect(rateLimitError({ recent: [], pending: 0, draft, now: NOW })).toBeNull();
  });

  test("refuses the same words again within ten minutes, not after", () => {
    expect(rateLimitError({ recent: [sent(5, " hello ")], pending: 0, draft, now: NOW })).toMatch(
      /just sent/
    );
    expect(rateLimitError({ recent: [sent(11, "Hello")], pending: 0, draft, now: NOW })).toBeNull();
  });

  test("hourly, daily and waiting limits", () => {
    expect(rateLimitError({ recent: [sent(10), sent(20), sent(30)], pending: 0, draft, now: NOW })).toMatch(
      /an hour/
    );
    const spread = Array.from({ length: 10 }, (_, i) => sent(61 + i * 60));
    expect(rateLimitError({ recent: spread, pending: 0, draft, now: NOW })).toMatch(/a day/);
    expect(rateLimitError({ recent: [], pending: 10, draft, now: NOW })).toMatch(/scheduled/);
  });
});

test("scheduleError", () => {
  expect(scheduleError(NOW + 5 * MINUTE, NOW)).toBeNull();
  expect(scheduleError(NOW + 4 * MINUTE, NOW)).toMatch(/at least 5 minutes/);
  expect(scheduleError(Number.NaN, NOW)).toMatch(/at least 5 minutes/);
  expect(scheduleError(NOW + 91 * 24 * 60 * MINUTE, NOW)).toMatch(/90 days/);
});

test("the email carries the message, who sent it and the link", () => {
  expect(announcementPath("abc")).toBe("/announcements/abc");
  expect(
    announcementEmail({ title: "T", message: "M", senderName: "Ada", link: "https://x/announcements/abc" })
  ).toEqual({
    subject: "T",
    body: "M\n\n— Ada, via THE SHED\n\nOpen in THE SHED: https://x/announcements/abc",
  });
});

describe("choosing people", () => {
  const fiona = { email: "fiona@sow.org.au", name: "Fiona Ng", detail: "Finance" };
  const luke = { email: "luke@sow.org.au", name: "Luke", detail: "UNSW, Events" };

  test("emails are trimmed, lowercased and deduped, keeping their order", () => {
    expect(cleanEmails([" Luke@SOW.org.au", "fiona@sow.org.au", "luke@sow.org.au", " "])).toEqual([
      "luke@sow.org.au",
      "fiona@sow.org.au",
    ]);
  });

  test("search matches every word against name, email or what they do", () => {
    expect(personMatches(fiona, "")).toBe(true);
    expect(personMatches(fiona, "fiona ng")).toBe(true);
    expect(personMatches(fiona, "ng finance")).toBe(true);
    expect(personMatches(luke, "unsw")).toBe(true);
    expect(personMatches(luke, "luke@")).toBe(true);
    expect(personMatches(luke, "luke finance")).toBe(false);
  });

  test("select all adds the shown people; deselect takes just them off", () => {
    expect(withAll([luke.email], [fiona, luke])).toEqual([luke.email, fiona.email]);
    expect(withoutAll([luke.email, fiona.email, "x@sow.org.au"], [fiona, luke])).toEqual([
      "x@sow.org.au",
    ]);
  });

  test("a few names are listed; past three the rest are counted", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Ada"])).toBe("Ada");
    expect(nameList(["Ada", "Ben"])).toBe("Ada and Ben");
    expect(nameList(["Ada", "Ben", "Cal"])).toBe("Ada, Ben and Cal");
    expect(nameList(["Ada", "Ben", "Cal", "Dee"])).toBe("Ada, Ben, Cal and 1 more");
    expect(nameList(["Ada", "Ben", "Cal"], 7)).toBe("Ada, Ben, Cal and 4 more");
  });
});

describe("email choice", () => {
  const recipients = ["a@x", "b@x", "c@x"];
  const withApp = new Set(["b@x"]);

  test("round-trips through the stored flags", () => {
    for (const choice of ["none", "withoutApp", "everyone"] as const) {
      expect(emailChoiceOf(emailFlags(choice))).toBe(choice);
    }
    expect(emailChoiceOf({ sendEmail: true, emailWithoutApp: true })).toBe("everyone");
    expect(emailFlags("none")).toEqual({ sendEmail: false });
  });

  test("decides who gets an email", () => {
    expect(emailRecipients(recipients, withApp, "none")).toEqual([]);
    expect(emailRecipients(recipients, withApp, "withoutApp")).toEqual(["a@x", "c@x"]);
    expect(emailRecipients(recipients, withApp, "everyone")).toEqual(recipients);
  });

  test("warns only when someone would get neither a push nor an email", () => {
    expect(missesSomeone(2, "none")).toBe(true);
    expect(missesSomeone(2, "withoutApp")).toBe(false);
    expect(missesSomeone(2, "everyone")).toBe(false);
    expect(missesSomeone(0, "none")).toBe(false);
  });

  test("sums up how it goes out", () => {
    expect(emailDeliverySummary("none")).toBe("Push only");
    expect(emailDeliverySummary("withoutApp")).toBe("Push, and email to anyone without it");
    expect(emailDeliverySummary("everyone")).toBe("Push and email");
  });
});
