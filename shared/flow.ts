export const FINANCE = "Finance";

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
export const HEAD_OF_DIVISION: Role = "Head of Division";
export const DIRECTOR: Role = "Director";
export const STUDENT_LEADER: Role = "Student Leader";
export const MEMBER: Role = "Member";

export const UNIVERSITY_ROLES: readonly Role[] = [
  STUDENT_LEADER,
  "President",
  "Vice President",
  "Executive",
];
export const roleNeedsUniversity = (role: string): boolean =>
  UNIVERSITY_ROLES.includes(role as Role);

export const CHAPLAIN_ROLES: readonly Role[] = [
  "Senior Chaplain",
  "Junior Chaplain",
  "Intern Chaplain",
];

export const STAFF_SIDE_ROLES: readonly Role[] = [
  STAFF_ROLE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
];
export const rolesNeedUniversity = (roles: readonly string[]): boolean =>
  roles.some(roleNeedsUniversity) &&
  !roles.some((role) => STAFF_SIDE_ROLES.includes(role as Role));

export const SYSTEM_ROLES: readonly Role[] = [
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  DIRECTOR,
  STAFF_ROLE,
  MEMBER,
];
export const isSystemRole = (role: string): boolean =>
  SYSTEM_ROLES.includes(role as Role);

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

export const UNIVERSITY_COLOURS: Record<string, string> = {
  USYD: "#B5403D",
  UNSW: "#619445",
  UTS: "#3B5499",
  MACQ: "#F2C259",
  ACU: "#57427A",
  WSU: "#A60F2D",
  SOW: "#000000",
};

export const universityColour = (name: string): string | undefined =>
  UNIVERSITY_COLOURS[acronym(name)];

export const roleNeedsDepartment = (role: string): boolean =>
  role !== HEAD_OF_DIVISION && role !== MEMBER && role !== DIRECTOR && !roleNeedsUniversity(role);

export const CHAPLAINCY_DEPARTMENT = "Chaplaincy";

export const isChaplainRole = (role: string): boolean =>
  CHAPLAIN_ROLES.includes(role as Role);

export interface Assignment {
  role: string;
  department?: string;
  division?: string;
  university?: string;
}

export interface ProfileLike {
  assignments?: Assignment[];
}

export const rolesOfLike = (p: ProfileLike): string[] => [
  ...new Set((p.assignments ?? []).map((a) => a.role)),
];

export type ScopeKind = "department" | "division" | "university" | "none";
export const scopeKindFor = (role: string): ScopeKind => {
  if (role === HEAD_OF_DIVISION) return "division";
  if (isChaplainRole(role)) return "department";
  if (roleNeedsUniversity(role)) return "university";
  if (role === MEMBER || role === DIRECTOR) return "none";
  return "department";
};

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

export const assignmentsOf = (p: ProfileLike): Assignment[] =>
  p.assignments ?? [];

export const departmentsOf = (p: ProfileLike): string[] => [
  ...new Set(assignmentsOf(p).flatMap((a) => (a.department ? [a.department] : []))),
];

export const divisionsOf = (p: ProfileLike): string[] => [
  ...new Set(assignmentsOf(p).flatMap((a) => (a.division ? [a.division] : []))),
];

export const isMemberOfDepartment = (p: ProfileLike, department: string): boolean =>
  assignmentsOf(p).some((a) => a.department === department);

export const isHeadOfDivisionName = (p: ProfileLike, division: string): boolean =>
  assignmentsOf(p).some(
    (a) => a.role === HEAD_OF_DIVISION && a.division === division
  );

export const rolesForDepartment = (p: ProfileLike, department: string): string[] =>
  assignmentsOf(p)
    .filter((a) => a.department === department)
    .map((a) => a.role);

export const assignmentKey = (a: Assignment): string =>
  `${a.role} ${a.department ?? ""} ${a.division ?? ""} ${a.university ?? ""}`;

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

export const formatAssignment = (a: Assignment): string => {
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

export const DIRECTOR_APPROVAL_THRESHOLD = 5000;

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

export const SYDNEY_TIME_ZONE = "Australia/Sydney";

const sydneyYmdFixedOffset = (
  date: Date
): { year: number; month: number; day: number; hour: number } => {
  const aest = new Date(date.getTime() + 10 * 60 * 60 * 1000);
  const monthProbe = aest.getUTCMonth() + 1;
  const offsetH = monthProbe >= 4 && monthProbe <= 9 ? 10 : 11;
  const local = new Date(date.getTime() + offsetH * 60 * 60 * 1000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
  };
};

const sydneyYmd = (
  date: Date
): { year: number; month: number; day: number; hour: number } => {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: SYDNEY_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    }).formatToParts(date);
    const num = (type: Intl.DateTimeFormatPartTypes) => {
      const value = parts.find((p) => p.type === type)?.value;
      return Number((value ?? "0") === "24" ? "0" : (value ?? "0"));
    };
    const year = num("year");
    const month = num("month");
    const day = num("day");
    const hour = num("hour");
    if (
      !Number.isFinite(year) ||
      year < 1970 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    ) {
      return sydneyYmdFixedOffset(date);
    }
    return { year, month, day, hour };
  } catch {
    return sydneyYmdFixedOffset(date);
  }
};

export const staffYearForDate = (date: Date): number => {
  const { year, month } = sydneyYmd(date);
  return month >= 10 ? year + 1 : year;
};

export const incomingStaffYear = (date: Date = new Date()): number => {
  const current = staffYearForDate(date);
  return sydneyYmd(date).month < 10 ? current + 1 : current;
};

export const withinPrefillWindow = (now: Date = new Date()): boolean => {
  const { month, day, hour } = sydneyYmd(now);
  return month === 9 && day === 30 && hour >= 21;
};

export const eventStaffYear = (dateStart: number): number =>
  staffYearForDate(new Date(dateStart));

export const staffYearStartMs = (year: number): number =>
  Date.UTC(year - 1, 8, 30, 14, 0, 0, 0);

export const ROLLOVER_RATE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export const ROLLOVER_AUTH_GRACE_MS = ROLLOVER_RATE_GRACE_MS;

export const withinRolloverAuthGrace = (
  staffYear: number,
  now: Date = new Date()
): boolean => {
  if (now.getTime() < staffYearStartMs(staffYear)) return false;
  return sydneyCalendarYear(now) < staffYear;
};

export const withinRolloverRateGrace = (
  staffYear: number,
  now: Date = new Date()
): boolean => {
  const start = staffYearStartMs(staffYear);
  const t = now.getTime();
  return t >= start && t < start + ROLLOVER_RATE_GRACE_MS;
};

export const sydneyCalendarYear = (date: Date): number => sydneyYmd(date).year;

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

export const requestCompleted = (r: RequestLifecycle): boolean =>
  requestDeclined(r) || r.paid === true;

export const stepsForRequest = (r: ApprovalState): ApprovalStep[] => [
  "hod",
  "budgetManager",
  ...(r.approvedByDirector !== undefined ? (["director"] as const) : []),
  "financeHead",
];

export const currentStep = (r: ApprovalState): ApprovalStep | null => {
  if (requestDeclined(r)) return null;
  if (r.approvedByHOD === PENDING) return "hod";
  if (r.approvedByBudgetManager === PENDING) return "budgetManager";
  if (r.approvedByDirector === PENDING) return "director";
  if (r.approvedByFinanceHead === PENDING) return "financeHead";
  return null;
};

export const REACTION_EMOJIS: readonly string[] = [
  "👍", "👎", "❤️", "🔥", "🎉", "😂", "😅", "🙏", "👀", "✅",
  "❌", "⚠️", "💰", "💸", "🧾", "📎", "⏳", "🚀", "💯", "🤝",
  "🙌", "👏", "🤔", "😮", "😢", "😡", "🥳", "🫡", "💪", "✍️",
];

export const ALLOWED_REACTIONS = new Set(REACTION_EMOJIS);

export const QUICK_REACTION_EMOJIS: readonly string[] = [
  "👍", "❤️", "😂", "🎉", "🙏", "👀", "✅",
];
