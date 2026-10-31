// Who handles grievances and what the form offers are set in the app (Admin
// sets the departments, the team sets the options); these are the defaults.
export const DEFAULT_GRIEVANCE_DEPARTMENTS = ["People and Culture", "Compliance"];
export const DEFAULT_GRIEVANCE_CATEGORIES = [
  "How a leader or staff member acted",
  "Bullying or harassment",
  "Discrimination",
  "Safety or wellbeing",
  "A ministry, event or decision",
  "Something else",
];

export const MAX_GRIEVANCE_TEXT = 5000;
export const MAX_GRIEVANCE_SHORT = 200;
export const MAX_GRIEVANCE_OPTIONS = 20;
export const MAX_GRIEVANCE_OPTION = 80;
export const MAX_GRIEVANCE_DEPARTMENTS = 10;

export type GrievanceStatus = "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "NOT_PROCEEDING";

export type GrievanceOutcome = "RESOLVED" | "NOT_PROCEEDING";

export const OPEN_GRIEVANCE_STATUSES: GrievanceStatus[] = ["SUBMITTED", "IN_PROGRESS"];

export const isOpenGrievance = (status: GrievanceStatus) =>
  OPEN_GRIEVANCE_STATUSES.includes(status);

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  SUBMITTED: "Submitted",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  NOT_PROCEEDING: "Not proceeding",
};

// "A", "A and B", "A, B and C".
export const andList = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

// The team refers to a grievance by the start of its reference; submitters
// never see it.
export const grievanceRef = (ref: string) => ref.slice(0, 8).toUpperCase();

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

export const grievanceProblem = (input: GrievanceInput, categories: string[]): string | null => {
  if (!input.name) return "Please enter your name.";
  if (!EMAIL_RE.test(input.email) || input.email.includes("..")) {
    return "Please enter a valid email address.";
  }
  if (!categories.includes(input.category)) return "Please choose what it's about.";
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

// Trims, drops blanks and repeats; returns the list or what's wrong with it.
export const cleanNameList = (
  raw: string[],
  what: { one: string; max: number; maxLength: number }
): { list: string[] } | { problem: string } => {
  const list: string[] = [];
  for (const name of raw.map((n) => n.trim()).filter(Boolean)) {
    if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
  }
  if (list.length === 0) return { problem: `Add at least one ${what.one}.` };
  if (list.length > what.max) return { problem: `There can be at most ${what.max} ${what.one}s.` };
  if (list.some((n) => n.length > what.maxLength)) {
    return { problem: `Each ${what.one} can be at most ${what.maxLength} characters.` };
  }
  return { list };
};

export const grievanceDetailLines = (g: Omit<GrievanceInput, "name" | "email">): string[] =>
  [
    `About: ${g.category}`,
    g.campus ? `Campus or area: ${g.campus}` : "",
    g.happenedWhen ? `When: ${g.happenedWhen}` : "",
    g.peopleInvolved ? `People involved: ${g.peopleInvolved}` : "",
    `What happened:\n${g.details}`,
    g.hopedOutcome ? `Hoped-for outcome: ${g.hopedOutcome}` : "",
  ].filter(Boolean);

type StepState = "done" | "declined" | "current" | "todo";

export type GrievanceStep = {
  key: "submitted" | "inProgress" | "closed";
  label: string;
  state: StepState;
  name: string | null;
  at: number | null;
};

export const grievanceStepTrack = (
  g: { status: GrievanceStatus; submittedAt: number; inProgressAt?: number; closedAt?: number },
  names: { submitter: string; assignee: string | null; closedBy: string | null }
): GrievanceStep[] => {
  const notProceeding = g.status === "NOT_PROCEEDING";
  const closed = notProceeding || g.status === "RESOLVED";
  const started = g.inProgressAt !== undefined;
  return [
    { key: "submitted", label: "Submitted", state: "done", name: names.submitter, at: g.submittedAt },
    {
      key: "inProgress",
      label: "In progress",
      state: started ? "done" : closed ? "todo" : "current",
      name: started ? names.assignee : null,
      at: g.inProgressAt ?? null,
    },
    {
      key: "closed",
      label: notProceeding ? "Not proceeding" : "Resolved",
      state: notProceeding ? "declined" : closed ? "done" : started ? "current" : "todo",
      name: names.closedBy,
      at: g.closedAt ?? null,
    },
  ];
};
