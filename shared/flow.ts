/**
 * Domain constants and pure helpers shared by the Convex backend and the app.
 * Implements the rules in REQUESTS_FLOW.md.
 */

export const FINANCE = "Finance";

/**
 * Admins are the Data and IT department plus every department in the Human
 * Resources division (People and Culture, Training and Development).
 */
export const ADMIN_DEPARTMENTS = ["Data and IT"];
export const ADMIN_DIVISIONS = ["Human Resources"];

export const ROLES = [
  "Staff",
  "Student Leader",
  "President",
  "Vice President",
  "Executive",
  "Head of Department",
  "Head of Division",
  "Director",
  "Senior Chaplain",
  "Junior Chaplain",
  "Intern Chaplain",
  "Outsource",
  "Member",
] as const;
export type Role = (typeof ROLES)[number];

export const STAFF_ROLE: Role = "Staff";
export const HEAD_OF_DEPARTMENT: Role = "Head of Department";
/** Heads of Division belong directly to a division, not a department. */
export const HEAD_OF_DIVISION: Role = "Head of Division";
export const DIRECTOR: Role = "Director";
/** Student Leaders belong to a university, not a department. */
export const STUDENT_LEADER: Role = "Student Leader";
export const MEMBER: Role = "Member";

/** Campus roles belong to a university instead of a department. */
export const UNIVERSITY_ROLES: readonly Role[] = [
  STUDENT_LEADER,
  "President",
  "Vice President",
  "Executive",
];
export const roleNeedsUniversity = (role: string): boolean =>
  UNIVERSITY_ROLES.includes(role as Role);

/** Chaplains serve across campuses and may optionally carry a university. */
export const CHAPLAIN_ROLES: readonly Role[] = [
  "Senior Chaplain",
  "Junior Chaplain",
  "Intern Chaplain",
];

/**
 * Roles that block a university field on a profile: Staff, HOD, and HODiv
 * are purely org-internal positions that never belong to a campus.
 * Director, Chaplains and campus roles are all excluded.
 */
export const STAFF_SIDE_ROLES: readonly Role[] = [
  STAFF_ROLE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
];
export const rolesNeedUniversity = (roles: readonly string[]): boolean =>
  roles.some(roleNeedsUniversity) &&
  !roles.some((role) => STAFF_SIDE_ROLES.includes(role as Role));

/**
 * Roles with hardcoded semantics elsewhere (heads, director, staff fallback,
 * member scope). They are created/maintained by the app, so renaming or
 * deleting them would break invariants — the admin Roles UI hides their
 * edit/delete controls and the backend rejects the mutations outright.
 */
export const SYSTEM_ROLES: readonly Role[] = [
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  DIRECTOR,
  STAFF_ROLE,
  MEMBER,
];
export const isSystemRole = (role: string): boolean =>
  SYSTEM_ROLES.includes(role as Role);

/** Short display forms for cards; anything not listed shows in full. */
export const DISPLAY_ACRONYMS: Record<string, string> = {
  "Head of Department": "HOD",
  "Macquarie University": "MACQ",
  "University of New South Wales": "UNSW",
  "University of Sydney": "USYD",
  "University of Technology, Sydney": "UTS",
  "Australian Catholic University": "ACU",
  "Western Sydney University": "WSU",
};
export const acronym = (name: string): string => DISPLAY_ACRONYMS[name] ?? name;

/**
 * Brand colour per campus, keyed by acronym (see DISPLAY_ACRONYMS). "SOW" is
 * the whole-org colour (used by the Attendance "ALL" sub-group). Shared so the
 * org chart and the Attendance screens tint campuses identically.
 */
export const UNIVERSITY_COLOURS: Record<string, string> = {
  USYD: "#B5403D",
  UNSW: "#619445",
  UTS: "#3B5499",
  MACQ: "#F2C259",
  ACU: "#57427A",
  WSU: "#990033",
  SOW: "#000000",
};

/** The brand colour for a campus by full name or acronym, if one is known. */
export const universityColour = (name: string): string | undefined =>
  UNIVERSITY_COLOURS[acronym(name)];

/** Roles that take a department; the exceptions belong elsewhere. */
export const roleNeedsDepartment = (role: string): boolean =>
  role !== HEAD_OF_DIVISION && role !== MEMBER && role !== DIRECTOR && !roleNeedsUniversity(role);

// ---------------------------------------------------------------------------
// Per-role scope links (assignments)
// ---------------------------------------------------------------------------

/** Chaplains are always attached to this one department. */
export const CHAPLAINCY_DEPARTMENT = "Chaplaincy";

export const isChaplainRole = (role: string): boolean =>
  CHAPLAIN_ROLES.includes(role as Role);

/** A single role tied to its specific scope. */
export interface Assignment {
  role: string;
  department?: string;
  division?: string;
  university?: string;
}

/**
 * The minimal shape the assignment helpers read. Both the Convex
 * `Doc<"staffProfiles">` and the app's profile payloads satisfy it, so these
 * helpers stay pure and free of the Convex `Doc` type.
 */
export interface ProfileLike {
  assignments?: Assignment[];
}

/** A profile's distinct roles, derived from its assignments. */
export const rolesOfLike = (p: ProfileLike): string[] => [
  ...new Set((p.assignments ?? []).map((a) => a.role)),
];

/**
 * The primary scope a role attaches to. Chaplains are department-scoped
 * (`"Chaplaincy"`) but may additionally carry a university. Aligned with
 * `roleNeedsDepartment`/`roleNeedsUniversity` to minimise behaviour change.
 */
export type ScopeKind = "department" | "division" | "university" | "none";
export const scopeKindFor = (role: string): ScopeKind => {
  if (role === HEAD_OF_DIVISION) return "division";
  if (isChaplainRole(role)) return "department";
  if (roleNeedsUniversity(role)) return "university";
  if (role === MEMBER || role === DIRECTOR) return "none";
  return "department"; // Staff, HOD, Outsource
};

/**
 * Build the assignment for a single role from a set of candidate scope values
 * (e.g. the one department/university an admin picked). Used when writing
 * assignments and when deriving them from legacy fields.
 */
export const assignmentFor = (
  role: string,
  scope: { department?: string; division?: string; university?: string }
): Assignment => {
  if (isChaplainRole(role)) {
    return {
      role,
      department: CHAPLAINCY_DEPARTMENT,
      university: scope.university,
    };
  }
  switch (scopeKindFor(role)) {
    case "division":
      return { role, division: scope.division };
    case "university":
      return { role, university: scope.university };
    case "none":
      return { role };
    case "department":
    default:
      return { role, department: scope.department };
  }
};

/** A profile's per-role scope links. */
export const assignmentsOf = (p: ProfileLike): Assignment[] =>
  p.assignments ?? [];

/** Distinct departments a profile is linked to (any role). */
export const departmentsOf = (p: ProfileLike): string[] => [
  ...new Set(assignmentsOf(p).flatMap((a) => (a.department ? [a.department] : []))),
];

/** Distinct divisions a profile is linked to (any role). */
export const divisionsOf = (p: ProfileLike): string[] => [
  ...new Set(assignmentsOf(p).flatMap((a) => (a.division ? [a.division] : []))),
];

export const isMemberOfDepartment = (p: ProfileLike, department: string): boolean =>
  assignmentsOf(p).some((a) => a.department === department);

export const isHeadOfDivisionName = (p: ProfileLike, division: string): boolean =>
  assignmentsOf(p).some(
    (a) => a.role === HEAD_OF_DIVISION && a.division === division
  );

/** The roles a profile holds within a given department, for per-placement tags. */
export const rolesForDepartment = (p: ProfileLike, department: string): string[] =>
  assignmentsOf(p)
    .filter((a) => a.department === department)
    .map((a) => a.role);

/** Stable key for deduping assignments by role + scope. */
export const assignmentKey = (a: Assignment): string =>
  `${a.role} ${a.department ?? ""} ${a.division ?? ""} ${a.university ?? ""}`;

/** Dedupe a list of assignments by role + scope, preserving order. */
export const dedupeAssignments = (assignments: Assignment[]): Assignment[] => {
  const seen = new Set<string>();
  const out: Assignment[] = [];
  for (const a of assignments) {
    const key = assignmentKey(a);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
};

/**
 * Display label for one role-scope link, e.g. "HOD → Finance" or
 * "Senior Chaplain → USYD"; just the role when it has no scope. Chaplaincy roles
 * are scoped to a campus, so the "Chaplaincy" department is dropped from the
 * label (e.g. "Intern Chaplain → USYD", not "Intern Chaplain → Chaplaincy · USYD").
 */
export const formatAssignment = (a: Assignment): string => {
  // Only drop the "Chaplaincy" department for actual chaplain roles — a
  // non-chaplain role scoped to Chaplaincy (e.g. a Head of Department) still
  // needs its department shown so it doesn't collapse to a bare role label.
  const department =
    isChaplainRole(a.role) && a.department === CHAPLAINCY_DEPARTMENT
      ? undefined
      : a.department;
  const scope = [department, a.division, a.university]
    .filter((s): s is string => !!s)
    .map(acronym)
    .join(" · ");
  return scope ? `${acronym(a.role)} → ${scope}` : acronym(a.role);
};

/**
 * Default $ amount at or above which a request needs the Director's approval.
 * Finance can override it per staff year (yearSettings.directorApprovalThreshold);
 * this is the fallback for years that haven't set one. Historical years are
 * backfilled to this value (admin:backfillDirectorThresholds).
 */
export const DIRECTOR_APPROVAL_THRESHOLD = 5000;

/** The Director-approval threshold for a year, falling back to the default. */
export const directorThresholdOr = (configured: number | null | undefined): number =>
  configured ?? DIRECTOR_APPROVAL_THRESHOLD;

export type ApprovalStatus = "PENDING" | "APPROVED" | "DECLINED";
export const PENDING: ApprovalStatus = "PENDING";
export const APPROVED: ApprovalStatus = "APPROVED";
export const DECLINED: ApprovalStatus = "DECLINED";

export type ApprovalStep = "hod" | "budgetManager" | "director" | "financeHead";

export const STEP_LABELS: Record<ApprovalStep, string> = {
  hod: "HOD",
  budgetManager: "Budget Manager",
  director: "Director",
  financeHead: "Finance Head",
};

/**
 * The staff year rolls over at midnight on October 1st, Sydney time: from
 * that moment the app operates on the next calendar year's roles, departments
 * and requests. Midnight Oct 1 is always AEST (UTC+10 — daylight saving starts
 * at 2am on the first Sunday of October, which is on or after Oct 1, so the
 * boundary instant is never inside DST), so shifting +10h and reading UTC
 * fields lands the boundary on Sydney midnight regardless of where this runs
 * (the Convex server is UTC; a client is in the device's timezone).
 */
export const staffYearForDate = (date: Date): number => {
  const sydney = new Date(date.getTime() + 10 * 60 * 60 * 1000);
  return sydney.getUTCMonth() >= 9
    ? sydney.getUTCFullYear() + 1
    : sydney.getUTCFullYear();
};

/**
 * The staff year an event belongs to, derived from its start date (epoch ms).
 * Events carry no stored `year` column — this is the single place that maps an
 * event to its staff year, so it always tracks `staffYearForDate`. An event
 * spanning the rollover is bucketed by where it STARTS.
 */
export const eventStaffYear = (dateStart: number): number =>
  staffYearForDate(new Date(dateStart));

/**
 * The first instant (epoch ms) of staff year `year` — i.e. Sydney midnight on
 * October 1 of the previous calendar year (AEST, UTC+10 → Sep 30 14:00 UTC).
 * A staff year is a contiguous start-date window, so the events with
 * `eventStaffYear(dateStart) === year` are exactly those with
 * `staffYearStartMs(year) <= dateStart < staffYearStartMs(year + 1)`. This lets
 * a `by_dateStart` range query stand in for the dropped `by_year` index.
 */
export const staffYearStartMs = (year: number): number =>
  Date.UTC(year - 1, 8, 30, 14, 0, 0, 0);

/**
 * The calendar year in Sydney — which is what attendance members and metadata
 * are keyed by. The year only ever rolls over at Jan 1, which is always inside
 * AEDT (UTC+11 — Australian daylight saving runs October→April), so shifting
 * +11h and reading the UTC year lands the boundary on Sydney midnight wherever
 * this runs. (Contrast staffYearForDate, whose Oct 1 boundary is AEST, +10.)
 */
export const sydneyCalendarYear = (date: Date): number =>
  new Date(date.getTime() + 11 * 60 * 60 * 1000).getUTCFullYear();

/**
 * Earliest staff year with any reimbursement requests (the old web app's
 * history starts here). Bounds the requests year picker so it never offers
 * years that can't have requests, even though the org structure goes back
 * further (to 2008).
 */
export const EARLIEST_REQUEST_YEAR = 2021;

export interface ApprovalState {
  approvedByHOD: ApprovalStatus;
  approvedByBudgetManager: ApprovalStatus;
  approvedByDirector?: ApprovalStatus;
  approvedByFinanceHead: ApprovalStatus;
}

export const requestDeclined = (r: ApprovalState): boolean =>
  r.approvedByHOD === DECLINED ||
  r.approvedByBudgetManager === DECLINED ||
  r.approvedByDirector === DECLINED ||
  r.approvedByFinanceHead === DECLINED;

export const requestFullyApproved = (r: ApprovalState): boolean =>
  r.approvedByHOD === APPROVED &&
  r.approvedByBudgetManager === APPROVED &&
  (r.approvedByDirector === undefined || r.approvedByDirector === APPROVED) &&
  r.approvedByFinanceHead === APPROVED;

export interface RequestLifecycle extends ApprovalState {
  receipt?: unknown;
  paid?: boolean;
}

export type RequestDisplayStatus =
  | "AWAITING APPROVAL"
  | "AWAITING RECEIPT"
  | "AWAITING PAYMENT"
  | "PAID"
  | "DECLINED";

export const requestDisplayStatus = (r: RequestLifecycle): RequestDisplayStatus => {
  if (requestDeclined(r)) return "DECLINED";
  if (r.paid === true) return "PAID";
  if (!requestFullyApproved(r)) return "AWAITING APPROVAL";
  if (!r.receipt) return "AWAITING RECEIPT";
  return "AWAITING PAYMENT";
};

/** A request is closed when it can no longer move forward. */
export const requestCompleted = (r: RequestLifecycle): boolean =>
  requestDeclined(r) || r.paid === true;

/** Ordered steps for a request (Director only when that step exists). */
export const stepsForRequest = (r: ApprovalState): ApprovalStep[] => [
  "hod",
  "budgetManager",
  ...(r.approvedByDirector !== undefined ? (["director"] as const) : []),
  "financeHead",
];

/**
 * The step a request currently waits on, or null when all approvals are done
 * or the request was declined.
 */
export const currentStep = (r: ApprovalState): ApprovalStep | null => {
  if (requestDeclined(r)) return null;
  if (r.approvedByHOD === PENDING) return "hod";
  if (r.approvedByBudgetManager === PENDING) return "budgetManager";
  if (r.approvedByDirector === PENDING) return "director";
  if (r.approvedByFinanceHead === PENDING) return "financeHead";
  return null;
};

/** The full set of emoji the reaction picker exposes. Validated server-side too. */
export const ALLOWED_REACTIONS = new Set([
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😅", "🙏", "👀", "✅",
  "❌", "⚠️", "💰", "💸", "🧾", "📎", "⏳", "🚀", "💯", "🤝",
  "🙌", "👏", "🤔", "😮", "😢", "😡", "🥳", "🫡", "💪", "✍️",
]);
