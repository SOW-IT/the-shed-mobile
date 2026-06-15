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

/** Short display forms for cards; anything not listed shows in full. */
export const DISPLAY_ACRONYMS: Record<string, string> = {
  "Head of Department": "HOD",
  "Macquarie University": "MACQ",
  "University of New South Wales": "UNSW",
  "University of Sydney": "USYD",
  "University of Technology, Sydney": "UTS",
  "Australian Catholic University": "ACU",
};
export const acronym = (name: string): string => DISPLAY_ACRONYMS[name] ?? name;

/** Roles that take a department; the exceptions belong elsewhere. */
export const roleNeedsDepartment = (role: string): boolean =>
  role !== HEAD_OF_DIVISION && role !== MEMBER && !roleNeedsUniversity(role);

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
  roles?: string[];
  role?: string;
  department?: string;
  division?: string;
  university?: string;
  assignments?: Assignment[];
}

/** A profile's roles; reads the legacy single-role field transparently. */
export const rolesOfLike = (p: ProfileLike): string[] =>
  p.roles ?? (p.role ? [p.role] : []);

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
  if (role === MEMBER) return "none";
  return "department"; // Staff, HOD, Director, Outsource
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

/**
 * A profile's per-role scope links. Returns the stored `assignments` when
 * present; otherwise derives them from the legacy single-scope fields so every
 * reader works before the backfill runs.
 */
export const assignmentsOf = (p: ProfileLike): Assignment[] => {
  if (p.assignments && p.assignments.length > 0) return p.assignments;
  return rolesOfLike(p).map((role) =>
    assignmentFor(role, {
      department: p.department,
      division: p.division,
      university: p.university,
    })
  );
};

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
 * "Senior Chaplain → Chaplaincy · USYD"; just the role when it has no scope.
 */
export const formatAssignment = (a: Assignment): string => {
  const scope = [a.department, a.division, a.university]
    .filter((s): s is string => !!s)
    .map(acronym)
    .join(" · ");
  return scope ? `${acronym(a.role)} → ${scope}` : acronym(a.role);
};

/** Requests at or above this amount need the Director's approval. */
export const DIRECTOR_APPROVAL_THRESHOLD = 5000;

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
 * The staff year rolls over on September 1st: from that day the app operates
 * on the next calendar year's roles, departments and requests.
 */
export const staffYearForDate = (date: Date): number =>
  date.getMonth() >= 8 ? date.getFullYear() + 1 : date.getFullYear();

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
