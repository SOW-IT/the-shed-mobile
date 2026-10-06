import { FINANCE } from "./flow";
import { formatAmount, toCents } from "./money";
import { isValidUrl, MAX_ANSWER_LENGTH } from "./forms";
import { MARKETING } from "./designRequests";

// ── Who's involved ──────────────────────────────────────────────────────────

/** Reviews every event's Risk form; its head approves them. */
export const COMPLIANCE = "Compliance";

/** Runs SOW's events: can read every event request. */
export const EVENTS = "Events";

/** The first staff year THE SHED took event requests (imported from the old web app). */
export const EARLIEST_EVENT_REQUEST_YEAR = 2023;

/** Events with total expenses over this also need the Director, unless Admin sets another amount. */
export const EVENT_DIRECTOR_APPROVAL_THRESHOLD = 5000;

export const eventDirectorThresholdOr = (configured: number | null | undefined): number =>
  configured ?? EVENT_DIRECTOR_APPROVAL_THRESHOLD;

export type SubFormKind = "marketing" | "risk" | "finance";
export const SUB_FORM_KINDS: readonly SubFormKind[] = ["marketing", "risk", "finance"];

export const SUB_FORM_LABELS: Record<SubFormKind, string> = {
  marketing: "Marketing",
  risk: "Risk",
  finance: "Finance",
};

/** The department that reviews each form; its head approves it. */
export const SUB_FORM_TEAMS: Record<SubFormKind, string> = {
  marketing: MARKETING,
  risk: COMPLIANCE,
  finance: FINANCE,
};

/** Each team's shared inbox, which gets the emails about its form. */
export const SUB_FORM_INBOXES: Record<SubFormKind, string> = {
  marketing: "marketing@sow.org.au",
  risk: "compliance@sow.org.au",
  finance: "finance@sow.org.au",
};

export const isSubFormKind = (value: string): value is SubFormKind =>
  (SUB_FORM_KINDS as readonly string[]).includes(value);

// ── Statuses ────────────────────────────────────────────────────────────────

export type EventRequestStatus = "IN_PROGRESS" | "APPROVED" | "CANCELLED";

export const EVENT_STATUS_LABELS: Record<EventRequestStatus, string> = {
  IN_PROGRESS: "In progress",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export type SubFormStatus =
  | "DRAFT"
  | "PENDING"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "NOT_REQUIRED";

export const SUB_FORM_STATUS_LABELS: Record<SubFormStatus, string> = {
  DRAFT: "Not submitted",
  PENDING: "Waiting for approval",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  NOT_REQUIRED: "Not required",
};

/** Finance's approval runs Director (only for big budgets) then Finance Head. */
export type FinanceStep = "director" | "financeHead";

export const FINANCE_STEP_LABELS: Record<FinanceStep, string> = {
  director: "Director",
  financeHead: "Finance Head",
};

/** Counts towards the event going ahead. */
export const isSubFormDone = (status: SubFormStatus): boolean =>
  status === "APPROVED" || status === "NOT_REQUIRED";

/** The requester's side can still change it. */
export const isSubFormEditable = (status: SubFormStatus): boolean =>
  status === "DRAFT" || status === "CHANGES_REQUESTED";

/** What the event is once its forms are in these states (unless it's cancelled). */
export const eventStatusFor = (statuses: readonly SubFormStatus[]): EventRequestStatus =>
  statuses.length === SUB_FORM_KINDS.length && statuses.every(isSubFormDone)
    ? "APPROVED"
    : "IN_PROGRESS";

// ── Event size ──────────────────────────────────────────────────────────────

export type EventSize = "small" | "medium" | "large";

export const EVENT_SIZE_LABELS: Record<EventSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export const REGISTRATION_GOAL_HINT =
  "Small: less than 50, Medium: 50–100, Large: more than 100";

/** The event's size from its registration goal, or null with no goal. */
export const eventSize = (registrationGoal: number | undefined): EventSize | null => {
  if (registrationGoal === undefined || !(registrationGoal > 0)) return null;
  if (registrationGoal < 50) return "small";
  if (registrationGoal <= 100) return "medium";
  return "large";
};

// ── Risk (SOW's Risk Management Standard, 2026) ─────────────────────────────

export const RISK_STANDARD_VIEW_URL =
  "https://docs.google.com/document/d/1IEoNLT6124RLYPqFg-mSHUl5qtR-pHiL/edit?usp=drivesdk&rtpof=true&sd=true";
export const RISK_STANDARD_DOWNLOAD_URL =
  "https://drive.google.com/uc?export=download&id=1IEoNLT6124RLYPqFg-mSHUl5qtR-pHiL";

export type RiskCategory = "safety" | "people" | "reputation" | "finance";
export const RISK_CATEGORIES: readonly RiskCategory[] = [
  "safety",
  "people",
  "reputation",
  "finance",
];

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  safety: "Health and safety",
  people: "People and culture",
  reputation: "Reputation",
  finance: "Finance",
};

export const RISK_CATEGORY_DESCRIPTIONS: Record<RiskCategory, string> = {
  safety:
    "Physical or mental harm, injuries, or unsafe conditions affecting SOW members and staff.",
  people:
    "The wellbeing of SOW members and staff, their conduct, and the impact on SOW's culture.",
  reputation:
    "Anything that could damage SOW's standing, public trust, credibility, or relationships with members and others.",
  finance:
    "Financial loss, budget overruns, unexpected expenses, or weak financial oversight.",
};

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export const RISK_LEVELS: readonly RiskLevel[] = [1, 2, 3, 4, 5];

/** The worst consequence that could reasonably happen, by category and level. */
export const CONSEQUENCE_GUIDE: Record<RiskCategory, Record<RiskLevel, string>> = {
  safety: {
    1: "No injuries, or none needing first aid. Localised damage to property, easily repaired.",
    2: "First aid needed (e.g. minor cuts or bruising). Minor damage to property and equipment.",
    3: "Medical treatment required. Needs outside help (e.g. fire, police).",
    4: "Serious injury needing specialist treatment or hospital. Outside help needed, with significant long-term impact.",
    5: "Loss of life, permanent disability or multiple serious injuries. Total loss of buildings, equipment or records.",
  },
  people: {
    1: "Negligible staff or campus leader burnout. Negligible impact on culture.",
    2: "Some burnout in non-critical roles or among campus leaders. Minor, short-term impact on culture or engagement.",
    3: "Burnout of a few key and critical roles expected. Moderate, short-term impact on culture.",
    4: "Major staff and campus leader burnout, poor fit in key roles, moderate turnover over time. Moderate, long-term impact on culture.",
    5: "Systematic staff and campus turnover, including key and critical roles. Significant, long-term impact on culture.",
  },
  reputation: {
    1: "Minimal interruption to ministry.",
    2: "Minor long-term effect on ministry.",
    3: "Probable long-term impact on ministry.",
    4: "Significant long-term impact on ministry.",
    5: "Extended interruption to ministry; full recovery unlikely.",
  },
  finance: {
    1: "Low financial loss (less than $1k).",
    2: "Medium financial loss (less than $5k).",
    3: "High financial loss ($5k–$20k).",
    4: "Major financial loss ($20k–$50k).",
    5: "Financial failure (over $50k).",
  },
};

export const LIKELIHOOD_GUIDE: Record<
  RiskLevel,
  { label: string; chance: string; frequency: string; general: string }
> = {
  5: {
    label: "Almost certain",
    chance: "Over 90%",
    frequency: "More than once a year",
    general: "It will happen under current conditions.",
  },
  4: {
    label: "Likely",
    chance: "50–90%",
    frequency: "Yearly to once every 2 years",
    general: "It will probably happen under current conditions.",
  },
  3: {
    label: "Possible",
    chance: "10–50%",
    frequency: "Once every 2 to 10 years",
    general: "It may happen in time.",
  },
  2: {
    label: "Unlikely",
    chance: "1–10%",
    frequency: "Once every 10 to 100 years",
    general: "It's unlikely to happen.",
  },
  1: {
    label: "Rare",
    chance: "Under 1%",
    frequency: "Less than once every 100 years",
    general: "It rarely happens.",
  },
};

export type RiskRating = "Low" | "Moderate" | "High" | "Very High" | "Extreme";
export const RISK_RATINGS: readonly RiskRating[] = [
  "Low",
  "Moderate",
  "High",
  "Very High",
  "Extreme",
];

/** The Standard's matrix: [likelihood][consequence] → score and rating. */
const MATRIX: Record<RiskLevel, readonly [number, RiskRating][]> = {
  5: [[7, "Moderate"], [13, "Moderate"], [19, "High"], [23, "Very High"], [25, "Extreme"]],
  4: [[6, "Low"], [10, "Moderate"], [15, "High"], [21, "Very High"], [24, "Extreme"]],
  3: [[3, "Low"], [9, "Moderate"], [14, "High"], [20, "High"], [22, "Extreme"]],
  2: [[2, "Low"], [8, "Low"], [11, "Moderate"], [16, "High"], [18, "Extreme"]],
  1: [[1, "Low"], [4, "Low"], [5, "Low"], [12, "Moderate"], [17, "High"]],
};

export const isRiskLevel = (value: unknown): value is RiskLevel =>
  typeof value === "number" && (RISK_LEVELS as readonly number[]).includes(value);

/** A risk's score (1–25) and rating, from how likely it is and how bad it would be. */
export const riskScore = (
  likelihood: RiskLevel,
  consequence: RiskLevel
): { score: number; rating: RiskRating } => {
  const [score, rating] = MATRIX[likelihood][consequence - 1];
  return { score, rating };
};

export interface RiskRow {
  description: string;
  category?: RiskCategory;
  consequence?: number;
  likelihood?: number;
  mitigation?: string;
  /** Imported from the old app's risk form, which rated risks differently. */
  legacyRating?: string;
}

export interface RiskData {
  noRisks: boolean;
  risks: RiskRow[];
  contingencies?: string;
}

export const MAX_RISK_ROWS = 40;

const clean = (text: string | undefined) => text?.trim() || undefined;

/** A row's score and rating, once it has both levels. */
export const rowScore = (row: RiskRow) =>
  isRiskLevel(row.likelihood) && isRiskLevel(row.consequence)
    ? riskScore(row.likelihood, row.consequence)
    : null;

/** The form as it's stored: text trimmed, blank rows dropped, and no rows when there are no risks. */
export const normalizeRisk = (data: RiskData): RiskData => {
  const risks = data.noRisks
    ? []
    : data.risks
        .map((row) => ({
          description: row.description.trim(),
          ...(row.category ? { category: row.category } : {}),
          ...(isRiskLevel(row.consequence) ? { consequence: row.consequence } : {}),
          ...(isRiskLevel(row.likelihood) ? { likelihood: row.likelihood } : {}),
          ...(clean(row.mitigation) ? { mitigation: clean(row.mitigation) } : {}),
          ...(clean(row.legacyRating) ? { legacyRating: clean(row.legacyRating) } : {}),
        }))
        .filter(
          (row) =>
            row.description ||
            row.category ||
            row.consequence ||
            row.likelihood ||
            row.mitigation
        );
  return {
    noRisks: data.noRisks,
    risks,
    ...(clean(data.contingencies) ? { contingencies: clean(data.contingencies) } : {}),
  };
};

const tooLong = (text: string | undefined) => (text?.length ?? 0) > MAX_ANSWER_LENGTH;

/** What stops a draft being saved: only things that are never allowed. */
export const riskDraftProblem = (data: RiskData): string | null => {
  if (data.risks.length > MAX_RISK_ROWS) {
    return `A risk form can list at most ${MAX_RISK_ROWS} risks.`;
  }
  const texts = [
    data.contingencies,
    ...data.risks.flatMap((r) => [r.description, r.mitigation]),
  ];
  if (texts.some(tooLong)) return `Each answer can be at most ${MAX_ANSWER_LENGTH} characters.`;
  return null;
};

/** What stops the form being submitted, as a message to fix, or null. */
export const riskProblem = (data: RiskData): string | null => {
  const draft = riskDraftProblem(data);
  if (draft) return draft;
  if (data.noRisks) return null;
  if (data.risks.length === 0) {
    return 'Add at least one risk, or tick "This event has no notable risks".';
  }
  for (const [index, row] of data.risks.entries()) {
    const which = `Risk ${index + 1}`;
    if (!row.description) return `${which}: describe the risk.`;
    if (!row.category) return `${which}: pick what kind of risk it is.`;
    if (!isRiskLevel(row.consequence)) return `${which}: pick how bad it could be.`;
    if (!isRiskLevel(row.likelihood)) return `${which}: pick how likely it is.`;
    const { rating } = riskScore(row.likelihood, row.consequence);
    if (rating !== "Low" && !row.mitigation) {
      return `${which} is rated ${rating}: say how you'll reduce it.`;
    }
  }
  return null;
};

/** The kinds of risk the form covers ("Major risk(s) considered"), in the Standard's order. */
export const majorRisks = (data: RiskData): RiskCategory[] =>
  RISK_CATEGORIES.filter((c) => data.risks.some((r) => r.category === c));

/** The highest-rated risk on the form, or null. */
export const highestRating = (data: RiskData): RiskRating | null => {
  let best = -1;
  for (const row of data.risks) {
    const score = rowScore(row);
    if (score) best = Math.max(best, RISK_RATINGS.indexOf(score.rating));
  }
  return best === -1 ? null : RISK_RATINGS[best];
};

// ── Finance ─────────────────────────────────────────────────────────────────

export interface FinanceLine {
  label: string;
  amount: number;
}

export interface FinanceData {
  income: FinanceLine[];
  expenses: FinanceLine[];
  spreadsheetUrl?: string;
}

export const MAX_FINANCE_LINES = 60;
export const MAX_FINANCE_AMOUNT = 1_000_000;

const normalizeLines = (lines: readonly FinanceLine[]): FinanceLine[] =>
  lines
    .map((line) => ({
      label: line.label.trim(),
      amount: Number.isFinite(line.amount) ? toCents(line.amount) / 100 : 0,
    }))
    .filter((line) => line.label || line.amount !== 0);

/** The form as it's stored: labels trimmed, amounts in cents, empty lines dropped. */
export const normalizeFinance = (data: FinanceData): FinanceData => ({
  income: normalizeLines(data.income),
  expenses: normalizeLines(data.expenses),
  ...(clean(data.spreadsheetUrl) ? { spreadsheetUrl: clean(data.spreadsheetUrl) } : {}),
});

/** Total income, total expenses and what's left over, rounded to cents. */
export const financeTotals = (data: FinanceData) => {
  const sum = (lines: readonly FinanceLine[]) =>
    lines.reduce((cents, line) => cents + toCents(line.amount), 0);
  const income = sum(data.income);
  const expenses = sum(data.expenses);
  return { income: income / 100, expenses: expenses / 100, net: (income - expenses) / 100 };
};

/** No money in or out: Finance doesn't need to approve it. */
export const financeNotRequired = (data: FinanceData): boolean => {
  const { income, expenses } = financeTotals(data);
  return income === 0 && expenses === 0;
};

/** Big budgets also go to the Director: expenses over the threshold. */
export const financeNeedsDirector = (data: FinanceData, threshold: number): boolean =>
  financeTotals(data).expenses > threshold;

/** What stops a draft being saved: only things that are never allowed. */
export const financeDraftProblem = (data: FinanceData): string | null => {
  const lines = [...data.income, ...data.expenses];
  if (lines.length > MAX_FINANCE_LINES) {
    return `A finance form can have at most ${MAX_FINANCE_LINES} lines.`;
  }
  if (lines.some((l) => tooLong(l.label))) {
    return `Each description can be at most ${MAX_ANSWER_LENGTH} characters.`;
  }
  if (lines.some((l) => l.amount < 0)) return "Amounts can't be negative.";
  if (lines.some((l) => l.amount > MAX_FINANCE_AMOUNT)) {
    return `Each amount can be at most $${formatAmount(MAX_FINANCE_AMOUNT)}.`;
  }
  if (tooLong(data.spreadsheetUrl)) return "That spreadsheet link is too long.";
  return null;
};

/** What stops the form being submitted, as a message to fix, or null. */
export const financeProblem = (data: FinanceData): string | null => {
  const draft = financeDraftProblem(data);
  if (draft) return draft;
  for (const [title, lines] of [
    ["Income", data.income],
    ["Expenses", data.expenses],
  ] as const) {
    for (const [index, line] of lines.entries()) {
      if (!line.label) return `${title} line ${index + 1}: say what it's for.`;
    }
  }
  if (data.spreadsheetUrl && !isValidUrl(data.spreadsheetUrl)) {
    return "The spreadsheet link needs to be a full link, starting with https://";
  }
  return null;
};

// ── Names ───────────────────────────────────────────────────────────────────

/** How an event request is named in emails and notifications. */
export const eventRequestName = (r: { name: string }): string => `Event request: ${r.name}`;

/** "#3 · 2027": an event request's number within its staff year. */
export const eventRequestRef = (r: { number: number; year: number }): string =>
  `#${r.number} · ${r.year}`;
