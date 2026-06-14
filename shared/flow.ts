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

/**
 * Staff-side roles: anyone holding one of these works in the org itself, so
 * their profile never carries a university — even if they also hold a campus
 * role that year.
 */
export const STAFF_SIDE_ROLES: readonly Role[] = [
  STAFF_ROLE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  DIRECTOR,
  "Senior Chaplain",
  "Junior Chaplain",
  "Intern Chaplain",
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
