import { formatAmount, toCents } from "./money";
import { pad2 } from "./datetime";
import { sydneyYmd } from "./flow";

/** The department that receives design requests; its head approves them. */
export const MARKETING = "Marketing";

/** The Marketing team's shared inbox: it gets the team's design request emails. */
export const MARKETING_TEAM_EMAIL = "marketing@sow.org.au";

/** The first staff year THE SHED took design requests (imported from the old web app). */
export const EARLIEST_DESIGN_REQUEST_YEAR = 2022;

export const MAX_ANSWER_LENGTH = 4000;

export type DesignRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DECLINED"
  | "COMPLETED"
  | "CANCELLED";

export const DESIGN_STATUS_LABELS: Record<DesignRequestStatus, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  DECLINED: "Declined",
  COMPLETED: "Complete",
  CANCELLED: "Cancelled",
};

/** Still being worked through: shown in every year's list until it closes. */
export const isOpenDesignStatus = (status: DesignRequestStatus): boolean =>
  status === "PENDING" || status === "APPROVED";

// ── The form ────────────────────────────────────────────────────────────────
//
// The questions themselves are defined on the server (convex/designRequestForm.ts)
// and sent to the app, which renders whatever it's given. Everything here works
// from a list of field definitions, so the app and the server check answers the
// same way.

export type DesignAnswer = string | number | boolean | string[];
export type DesignAnswers = Record<string, DesignAnswer>;

export type DesignFieldKind =
  | "department"
  | "checkboxes"
  | "text"
  | "longText"
  | "money"
  | "date"
  | "yesNo";

export interface DesignFieldOption {
  value: string;
  label: string;
}

export interface DesignField {
  /** Where the answer is stored. Never reuse a key for a different question. */
  key: string;
  kind: DesignFieldKind;
  /** The question as the form asks it. */
  label: string;
  /** A short name for the answer, used on the request page, in emails and in change lists. */
  shortLabel: string;
  hint?: string;
  placeholder?: string;
  required: boolean;
  /** Checkboxes: the choices. */
  options?: DesignFieldOption[];
  /** Checkboxes: the choice that asks for a written answer, stored under `<key>Other`. */
  otherOption?: string;
  /** Only asked when a checkbox question has this choice ticked. */
  showWhen?: { field: string; includes: string };
  /** Dates: nothing before today (Sydney). */
  notInPast?: boolean;
  /** Money: the largest amount accepted, in dollars. */
  max?: number;
  /** Text: the longest answer accepted; defaults to MAX_ANSWER_LENGTH. */
  maxLength?: number;
  /**
   * What the request is filed under: its department, its due date, and the
   * title it's listed with.
   */
  role?: "department" | "dueDate" | "title";
  /** Included in the summary emailed with every notification. */
  inSummary?: boolean;
}

export const otherKey = (field: Pick<DesignField, "key">) => `${field.key}Other`;

/** Whether a question is asked, given the answers so far. */
export const isFieldShown = (field: DesignField, answers: DesignAnswers): boolean => {
  if (!field.showWhen) return true;
  const ticked = answers[field.showWhen.field];
  return Array.isArray(ticked) && ticked.includes(field.showWhen.includes);
};

const trimmed = (value: DesignAnswer | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * The answers as they're stored: only questions the form asks (and that are
 * showing), text trimmed, empty answers dropped, ticked choices de-duplicated
 * in the order the form lists them, and amounts rounded to cents.
 */
export const normalizeDesignAnswers = (
  fields: readonly DesignField[],
  answers: DesignAnswers
): DesignAnswers => {
  const out: DesignAnswers = {};
  for (const field of fields) {
    if (!isFieldShown(field, answers)) continue;
    const value = answers[field.key];
    switch (field.kind) {
      case "checkboxes": {
        if (!Array.isArray(value)) break;
        const values = (field.options ?? [])
          .map((o) => o.value)
          .filter((v) => value.includes(v));
        if (values.length === 0) break;
        out[field.key] = values;
        const other = trimmed(answers[otherKey(field)]);
        if (field.otherOption && values.includes(field.otherOption) && other) {
          out[otherKey(field)] = other;
        }
        break;
      }
      case "money":
        if (typeof value === "number" && Number.isFinite(value)) {
          out[field.key] = toCents(value) / 100;
        }
        break;
      case "yesNo":
        if (typeof value === "boolean") out[field.key] = value;
        break;
      default: {
        const text = trimmed(value);
        if (text) out[field.key] = text;
      }
    }
  }
  return out;
};

/** Today's date in Sydney as YYYY-MM-DD, the earliest due date allowed. */
export const sydneyToday = (now: Date = new Date()): string => {
  const { year, month, day } = sydneyYmd(now);
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidDateString = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const missing = (field: DesignField): string => {
  switch (field.kind) {
    case "checkboxes":
      return `Pick at least one answer for "${field.shortLabel}".`;
    case "department":
      return "Pick a department.";
    case "money":
      return `Enter an amount for "${field.shortLabel}" ($0 if there's none).`;
    case "date":
      return `Pick a date for "${field.shortLabel}".`;
    default:
      return `Answer "${field.shortLabel}".`;
  }
};

/**
 * What's wrong with a set of normalised answers, as a message for the
 * requester, or null when they can be submitted. A date that can't be in the
 * past may still keep the value it had in `previous`, so an older request can
 * be edited without moving its due date.
 */
export const designAnswersProblem = (
  fields: readonly DesignField[],
  answers: DesignAnswers,
  today: string,
  previous?: DesignAnswers
): string | null => {
  for (const field of fields) {
    if (!isFieldShown(field, answers)) continue;
    const value = answers[field.key];
    const limit = field.maxLength ?? MAX_ANSWER_LENGTH;
    for (const text of [value, answers[otherKey(field)]]) {
      if (typeof text === "string" && text.length > limit) {
        return `"${field.shortLabel}" can be at most ${limit} characters.`;
      }
    }
    if (value === undefined) {
      if (field.required) return missing(field);
      continue;
    }
    if (
      field.kind === "checkboxes" &&
      field.otherOption &&
      (value as string[]).includes(field.otherOption) &&
      answers[otherKey(field)] === undefined
    ) {
      return `Say what "Other" is for "${field.shortLabel}".`;
    }
    if (field.kind === "money") {
      const amount = value as number;
      if (amount < 0) return missing(field);
      if (field.max !== undefined && amount > field.max) {
        return `"${field.shortLabel}" can be at most $${formatAmount(field.max)}.`;
      }
    }
    if (field.kind === "date") {
      const date = value as string;
      if (!isValidDateString(date)) return missing(field);
      if (field.notInPast && date < today && date !== previous?.[field.key]) {
        return `"${field.shortLabel}" can't be in the past.`;
      }
    }
  }
  return null;
};

/** "20 Oct 2026" for a YYYY-MM-DD date. */
export const formatDueDate = (value: string): string => {
  if (!isValidDateString(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
};

/** An answer as it reads on the request page and in emails, or null if unanswered. */
export const formatDesignAnswer = (
  field: DesignField,
  answers: DesignAnswers
): string | null => {
  const value = answers[field.key];
  if (value === undefined) return null;
  switch (field.kind) {
    case "checkboxes": {
      const other = answers[otherKey(field)];
      return (value as string[])
        .map((v) => {
          const label = field.options?.find((o) => o.value === v)?.label ?? v;
          return v === field.otherOption && typeof other === "string"
            ? `${label}: ${other}`
            : label;
        })
        .join(", ");
    }
    case "money":
      return `$${formatAmount(value as number)}`;
    case "date":
      return formatDueDate(value as string);
    case "yesNo":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
};

/** The short names of the questions whose answers differ. */
export const changedDesignAnswers = (
  fields: readonly DesignField[],
  before: DesignAnswers,
  after: DesignAnswers
): string[] =>
  fields
    .filter(
      (field) =>
        formatDesignAnswer(field, before) !== formatDesignAnswer(field, after)
    )
    .map((field) => field.shortLabel);

/** What a request is filed under, taken from the questions that have those roles. */
export const designRequestFiling = (
  fields: readonly DesignField[],
  answers: DesignAnswers
): { department: string; dueDate: string; title: string } => {
  const byRole = (role: DesignField["role"]) => fields.find((f) => f.role === role);
  const answer = (field: DesignField | undefined) =>
    field ? (formatDesignAnswer(field, answers) ?? "") : "";
  const due = byRole("dueDate");
  const dueValue = due ? answers[due.key] : undefined;
  return {
    department: answer(byRole("department")),
    dueDate: typeof dueValue === "string" ? dueValue : "",
    title: answer(byRole("title")),
  };
};

/** How a request is named in lists, emails and notifications. */
export const designRequestName = (r: { year: number; number: number }): string =>
  `Design request #${r.number} (${r.year})`;
