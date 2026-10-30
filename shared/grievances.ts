export const PEOPLE_AND_CULTURE = "People and Culture";
export const COMPLIANCE = "Compliance";
export const GRIEVANCE_DEPARTMENTS = [PEOPLE_AND_CULTURE, COMPLIANCE];
export const GRIEVANCES_TEAM_EMAIL = "grievances@sow.org.au";

export const MAX_GRIEVANCE_TEXT = 5000;
export const MAX_GRIEVANCE_SHORT = 200;

export type GrievanceStatus =
  | "SUBMITTED"
  | "RECEIVED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "NOT_PROCEEDING";

export type GrievanceOutcome = "RESOLVED" | "NOT_PROCEEDING";

export const OPEN_GRIEVANCE_STATUSES: GrievanceStatus[] = ["SUBMITTED", "RECEIVED", "IN_PROGRESS"];

export const isOpenGrievance = (status: GrievanceStatus) =>
  OPEN_GRIEVANCE_STATUSES.includes(status);

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  SUBMITTED: "Submitted",
  RECEIVED: "Received",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  NOT_PROCEEDING: "Not proceeding",
};

export const GRIEVANCE_CATEGORIES = [
  { value: "conduct", label: "How a leader or staff member acted" },
  { value: "bullying", label: "Bullying or harassment" },
  { value: "discrimination", label: "Discrimination" },
  { value: "safety", label: "Safety or wellbeing" },
  { value: "ministry", label: "A ministry, event or decision" },
  { value: "other", label: "Something else" },
] as const;

export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number]["value"];

export const grievanceCategoryLabel = (category: string): string =>
  GRIEVANCE_CATEGORIES.find((c) => c.value === category)?.label ?? category;

export const grievanceName = (grievance: { number: number }) => `Grievance #${grievance.number}`;

export type GrievanceInput = {
  name: string;
  email: string;
  phone?: string;
  campus?: string;
  category: string;
  details: string;
  happenedWhen?: string;
  peopleInvolved?: string;
  hopedOutcome?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const trimmed = (value: string | undefined) => {
  const text = value?.trim();
  return text ? text : undefined;
};

export const normalizeGrievance = (input: GrievanceInput): GrievanceInput => ({
  name: input.name.trim(),
  email: input.email.trim().toLowerCase(),
  phone: trimmed(input.phone),
  campus: trimmed(input.campus),
  category: input.category,
  details: input.details.trim(),
  happenedWhen: trimmed(input.happenedWhen),
  peopleInvolved: trimmed(input.peopleInvolved),
  hopedOutcome: trimmed(input.hopedOutcome),
});

export const grievanceProblem = (input: GrievanceInput): string | null => {
  if (!input.name) return "Please enter your name.";
  if (!EMAIL_RE.test(input.email) || input.email.includes("..")) {
    return "Please enter a valid email address.";
  }
  if (!GRIEVANCE_CATEGORIES.some((c) => c.value === input.category)) {
    return "Please choose what it's about.";
  }
  if (input.details.length < 10) return "Please tell us what happened.";
  if (input.details.length > MAX_GRIEVANCE_TEXT) {
    return `"What happened" can be at most ${MAX_GRIEVANCE_TEXT} characters.`;
  }
  const short = [input.name, input.email, input.phone, input.campus, input.happenedWhen];
  if (short.some((value) => (value?.length ?? 0) > MAX_GRIEVANCE_SHORT)) {
    return `Name, email, phone, campus and "when" can be at most ${MAX_GRIEVANCE_SHORT} characters each.`;
  }
  if ([input.peopleInvolved, input.hopedOutcome].some((v) => (v?.length ?? 0) > MAX_GRIEVANCE_TEXT)) {
    return `Each answer can be at most ${MAX_GRIEVANCE_TEXT} characters.`;
  }
  return null;
};

export const grievanceDetailLines = (g: Omit<GrievanceInput, "name" | "email">): string[] =>
  [
    `About: ${grievanceCategoryLabel(g.category)}`,
    g.campus ? `Campus or area: ${g.campus}` : "",
    g.happenedWhen ? `When: ${g.happenedWhen}` : "",
    g.peopleInvolved ? `People involved: ${g.peopleInvolved}` : "",
    `What happened:\n${g.details}`,
    g.hopedOutcome ? `Hoped-for outcome: ${g.hopedOutcome}` : "",
  ].filter(Boolean);

type StepState = "done" | "declined" | "current" | "todo";

export type GrievanceStep = {
  key: "submitted" | "received" | "inProgress" | "closed";
  label: string;
  state: StepState;
  name: string | null;
  at: number | null;
};

export const grievanceStepTrack = (
  g: {
    status: GrievanceStatus;
    submittedAt: number;
    receivedAt?: number;
    inProgressAt?: number;
    closedAt?: number;
  },
  names: { submitter: string; assignee: string | null; closedBy: string | null }
): GrievanceStep[] => {
  const order: GrievanceStatus[] = ["SUBMITTED", "RECEIVED", "IN_PROGRESS", "RESOLVED"];
  const notProceeding = g.status === "NOT_PROCEEDING";
  const reached = notProceeding ? 3 : order.indexOf(g.status);
  const stateAt = (index: number): StepState =>
    index <= reached ? "done" : index === reached + 1 ? "current" : "todo";
  return [
    { key: "submitted", label: "Submitted", state: "done", name: names.submitter, at: g.submittedAt },
    {
      key: "received",
      label: "Received",
      state: notProceeding && !g.receivedAt ? "todo" : stateAt(1),
      name: g.receivedAt ? names.assignee : null,
      at: g.receivedAt ?? null,
    },
    {
      key: "inProgress",
      label: "In progress",
      state: notProceeding && !g.inProgressAt ? "todo" : stateAt(2),
      name: null,
      at: g.inProgressAt ?? null,
    },
    {
      key: "closed",
      label: notProceeding ? "Not proceeding" : "Resolved",
      state: notProceeding ? "declined" : stateAt(3),
      name: names.closedBy,
      at: g.closedAt ?? null,
    },
  ];
};
