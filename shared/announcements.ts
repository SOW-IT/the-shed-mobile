import { acronym, type Assignment, ROLES } from "./flow";

/** A phone shows about this much of a notification's title before cutting it off. */
export const TITLE_MAX = 65;
/** Long enough for a notice, short enough to read on a lock screen. */
export const MESSAGE_MAX = 1000;

/**
 * Who an announcement goes to. With nothing chosen it goes to everyone with a
 * staff profile this year (all leaders). Choosing campuses, divisions or
 * departments sends it to people in any of them; choosing roles narrows it to
 * people with one of those roles (in a chosen group, if any are chosen).
 */
export type Audience = {
  campuses: string[];
  divisions: string[];
  departments: string[];
  roles: string[];
};

export const EVERYONE: Audience = { campuses: [], divisions: [], departments: [], roles: [] };

export const isEveryone = (audience: Audience): boolean =>
  audience.campuses.length === 0 &&
  audience.divisions.length === 0 &&
  audience.departments.length === 0 &&
  audience.roles.length === 0;

const hasGroups = (audience: Audience): boolean =>
  audience.campuses.length > 0 ||
  audience.divisions.length > 0 ||
  audience.departments.length > 0;

/**
 * Whether one of someone's assignments puts them in the audience. A role and
 * its group have to be on the same assignment: a Student Leader at UNSW who is
 * also Staff in Finance isn't a "Staff at UNSW". `divisionOf` gives a
 * department's division, so choosing a division reaches its departments' staff.
 */
export const assignmentInAudience = (
  assignment: Assignment,
  audience: Audience,
  divisionOf: (department: string) => string | undefined
): boolean => {
  const { university, department, division, role } = assignment;
  const inGroup =
    !hasGroups(audience) ||
    (!!university && audience.campuses.includes(university)) ||
    (!!department && audience.departments.includes(department)) ||
    (!!division && audience.divisions.includes(division)) ||
    (!!department && audience.divisions.includes(divisionOf(department) ?? ""));
  return inGroup && (audience.roles.length === 0 || audience.roles.includes(role));
};

export const inAudience = (
  assignments: readonly Assignment[],
  audience: Audience,
  divisionOf: (department: string) => string | undefined
): boolean =>
  isEveryone(audience) ||
  assignments.some((assignment) => assignmentInAudience(assignment, audience, divisionOf));

/** "All leaders", "UNSW, Finance", "All leaders · Student Leader", "UNSW · President, Vice President". */
export const audienceSummary = (audience: Audience): string => {
  const groups = [
    ...audience.campuses.map(acronym),
    ...audience.divisions,
    ...audience.departments,
  ];
  const where = groups.length > 0 ? groups.join(", ") : "All leaders";
  return audience.roles.length > 0
    ? `${where} · ${audience.roles.map(acronym).join(", ")}`
    : where;
};

/** Roles in the order the app lists them; roles it doesn't know go last, A–Z. */
export const sortRoles = (roles: Iterable<string>): string[] => {
  const order = (role: string) => {
    const i = (ROLES as readonly string[]).indexOf(role);
    return i === -1 ? ROLES.length : i;
  };
  return [...new Set(roles)].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
};

/** The trimmed title and message, or why they can't be sent. */
export const cleanDraft = (draft: {
  title: string;
  message: string;
}): { title: string; message: string } | { error: string } => {
  const title = draft.title.trim();
  const message = draft.message.trim();
  if (!title) return { error: "Add a title." };
  if (!message) return { error: "Add a message." };
  if (title.length > TITLE_MAX) {
    return { error: `Keep the title to ${TITLE_MAX} characters.` };
  }
  if (message.length > MESSAGE_MAX) {
    return { error: `Keep the message to ${MESSAGE_MAX} characters.` };
  }
  return { title, message };
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How many announcements one person can send or schedule in an hour. */
export const HOURLY_LIMIT = 3;
/** …and in a day. */
export const DAILY_LIMIT = 10;
/** How many can be waiting to go out from one person at once. */
export const PENDING_LIMIT = 10;
/** The same title and message again within this long is a double send. */
export const DUPLICATE_WINDOW = 10 * MINUTE;
/** A scheduled time has to be at least this far off; sooner is "Send now". */
export const MIN_SCHEDULE_LEAD = 5 * MINUTE;
/** …and no further off than this. */
export const MAX_SCHEDULE_AHEAD = 90 * DAY;

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Why this send would be too many, or null when it's fine. `recent` is the
 * sender's announcements from the last day that weren't cancelled (a
 * cancelled one never reached anyone), with when each was made.
 */
export const rateLimitError = (opts: {
  recent: readonly { createdAt: number; title: string; message: string }[];
  pending: number;
  draft: { title: string; message: string };
  now: number;
}): string | null => {
  const { recent, pending, draft, now } = opts;
  if (
    recent.some(
      (a) =>
        now - a.createdAt < DUPLICATE_WINDOW &&
        sameText(a.title, draft.title) &&
        sameText(a.message, draft.message)
    )
  ) {
    return "You've just sent this announcement. Check Scheduled and Sent below.";
  }
  if (recent.filter((a) => now - a.createdAt < HOUR).length >= HOURLY_LIMIT) {
    return `You can send ${HOURLY_LIMIT} announcements an hour. Try again later.`;
  }
  if (recent.filter((a) => now - a.createdAt < DAY).length >= DAILY_LIMIT) {
    return `You can send ${DAILY_LIMIT} announcements a day. Try again tomorrow.`;
  }
  if (pending >= PENDING_LIMIT) {
    return `You already have ${PENDING_LIMIT} announcements scheduled. Cancel one first.`;
  }
  return null;
};

/** Why `sendAt` can't be a scheduled time, or null when it can. */
export const scheduleError = (sendAt: number, now: number): string | null => {
  if (!Number.isFinite(sendAt) || sendAt < now + MIN_SCHEDULE_LEAD) {
    return "Pick a time at least 5 minutes from now, or choose Send now.";
  }
  if (sendAt > now + MAX_SCHEDULE_AHEAD) {
    return "Pick a time within the next 90 days.";
  }
  return null;
};

/** Where an announcement opens in the app. */
export const announcementPath = (id: string): string => `/announcements/${id}`;

/** The plain-text email that goes with an announcement. */
export const announcementEmail = (opts: {
  title: string;
  message: string;
  senderName: string;
  link: string;
}): { subject: string; body: string } => ({
  subject: opts.title,
  body: `${opts.message}\n\n— ${opts.senderName}, via THE SHED\n\nOpen in THE SHED: ${opts.link}`,
});
