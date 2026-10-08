import { describe, expect, test } from "vitest";
import {
  announcementEmail,
  announcementPath,
  audienceSummary,
  cleanDraft,
  EVERYONE,
  inAudience,
  isEveryone,
  MESSAGE_MAX,
  rateLimitError,
  scheduleError,
  sortRoles,
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
  expect(audienceSummary(EVERYONE)).toBe("Everyone");
  expect(
    audienceSummary({
      campuses: ["University of New South Wales"],
      divisions: ["Governance"],
      departments: ["Events"],
      roles: [],
    })
  ).toBe("UNSW, Governance, Events");
  expect(audienceSummary({ ...EVERYONE, roles: ["Head of Department", "Staff"] })).toBe(
    "Everyone · HOD, Staff"
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
  expect(scheduleError(NOW + 2 * MINUTE, NOW)).toBeNull();
  expect(scheduleError(Number.NaN, NOW)).toMatch(/at least a minute/);
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
