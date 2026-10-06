import { formatAmount, toCents } from "./money";
import { pad2 } from "./datetime";
import { SYDNEY_TIME_ZONE, sydneyYmd } from "./flow";

// A small engine for forms whose questions are defined on the server and sent
// to the app, which renders whatever it's given: design requests, event
// requests and their Marketing form. Everything here works from a list of
// field definitions, so the app and the server check answers the same way.

export const MAX_ANSWER_LENGTH = 4000;

export type FormAnswer = string | number | boolean | string[];
export type FormAnswers = Record<string, FormAnswer>;

export type FormFieldKind =
  | "department"
  | "checkboxes"
  | "choice"
  | "text"
  | "longText"
  | "number"
  | "money"
  | "date"
  | "dateTime"
  | "yesNo"
  | "url";

export interface FormFieldOption {
  value: string;
  label: string;
  /** Event sizes this choice is recommended for (see shared/eventRequests.ts). */
  recommended?: readonly string[];
  /**
   * No longer offered: the form hides it unless it's already ticked, so old
   * answers still read properly and can be kept when they're edited.
   */
  retired?: boolean;
}

export interface FormField {
  /** Where the answer is stored. Never reuse a key for a different question. */
  key: string;
  kind: FormFieldKind;
  /** The question as the form asks it. */
  label: string;
  /** A short name for the answer, used on the request page, in emails and in change lists. */
  shortLabel: string;
  hint?: string;
  placeholder?: string;
  required: boolean;
  /** A heading shown above this question (and the ones after it). */
  section?: string;
  /** Checkboxes and choices: the options. */
  options?: FormFieldOption[];
  /** Checkboxes: the choice that asks for a written answer, stored under `<key>Other`. */
  otherOption?: string;
  /** Only asked when a checkbox question has this choice ticked. */
  showWhen?: { field: string; includes: string };
  /** Dates and date-times: nothing before today (Sydney). */
  notInPast?: boolean;
  /** Date-times: can't be earlier than this other question's answer. */
  notBefore?: string;
  /** Date-times: can't be later than this other question's answer. */
  notAfter?: string;
  /** Money and numbers: the largest amount accepted. */
  max?: number;
  /** Text: the longest answer accepted; defaults to MAX_ANSWER_LENGTH. */
  maxLength?: number;
  /** What a record is filed under (its department, title, dates…), copied out of the answers. */
  role?: "department" | "dueDate" | "title" | "start" | "end" | "location";
  /** Included in the summary emailed with every notification. */
  inSummary?: boolean;
}

export const otherKey = (field: Pick<FormField, "key">) => `${field.key}Other`;

/** Whether a question is asked, given the answers so far. */
export const isFieldShown = (field: FormField, answers: FormAnswers): boolean => {
  if (!field.showWhen) return true;
  const ticked = answers[field.showWhen.field];
  return Array.isArray(ticked) && ticked.includes(field.showWhen.includes);
};

/** The options the form offers: retired ones only when they're already chosen. */
export const offeredOptions = (
  field: FormField,
  chosen: readonly string[]
): FormFieldOption[] =>
  (field.options ?? []).filter((o) => !o.retired || chosen.includes(o.value));

const trimmed = (value: FormAnswer | undefined) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * The answers as they're stored: only questions the form asks (and that are
 * showing), text trimmed, empty answers dropped, ticked choices de-duplicated
 * in the order the form lists them, amounts rounded to cents and counts to
 * whole numbers.
 */
export const normalizeAnswers = (
  fields: readonly FormField[],
  answers: FormAnswers
): FormAnswers => {
  const out: FormAnswers = {};
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
      case "choice":
        if (
          typeof value === "string" &&
          (field.options ?? []).some((o) => o.value === value)
        ) {
          out[field.key] = value;
        }
        break;
      case "money":
        if (typeof value === "number" && Number.isFinite(value)) {
          out[field.key] = toCents(value) / 100;
        }
        break;
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) {
          out[field.key] = Math.round(value);
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

/** A moment as a Sydney wall-clock date-time answer, "2026-01-12T13:00". */
export const sydneyDateTimeAnswer = (ms: number): string => {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/** "2026-01-12T13:00": a Sydney wall-clock date and time. */
export const isValidDateTimeString = (value: string): boolean => {
  const [date, time, ...rest] = value.split("T");
  return (
    rest.length === 0 &&
    time !== undefined &&
    isValidDateString(date) &&
    TIME_PATTERN.test(time)
  );
};

const URL_PATTERN = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export const isValidUrl = (value: string): boolean => URL_PATTERN.test(value);

const missing = (field: FormField): string => {
  switch (field.kind) {
    case "checkboxes":
      return `Pick at least one answer for "${field.shortLabel}".`;
    case "choice":
      return `Pick an answer for "${field.shortLabel}".`;
    case "department":
      return "Pick a department.";
    case "money":
      return `Enter an amount for "${field.shortLabel}" ($0 if there's none).`;
    case "number":
      return `Enter a number for "${field.shortLabel}".`;
    case "date":
      return `Pick a date for "${field.shortLabel}".`;
    case "dateTime":
      return `Pick a date and time for "${field.shortLabel}".`;
    case "url":
      return `Paste a link for "${field.shortLabel}".`;
    default:
      return `Answer "${field.shortLabel}".`;
  }
};

/** The problem with one date-time answer, or null. */
const dateTimeProblem = (
  fields: readonly FormField[],
  field: FormField,
  answers: FormAnswers,
  today: string,
  previous: FormAnswers | undefined
): string | null => {
  const value = answers[field.key] as string;
  if (!isValidDateTimeString(value)) return missing(field);
  if (
    field.notInPast &&
    value.slice(0, 10) < today &&
    value !== previous?.[field.key]
  ) {
    return `"${field.shortLabel}" can't be in the past.`;
  }
  const compare = (key: string | undefined, sign: 1 | -1) => {
    const other = key ? fields.find((f) => f.key === key) : undefined;
    const otherValue = other ? answers[other.key] : undefined;
    if (!other || typeof otherValue !== "string" || !isValidDateTimeString(otherValue)) {
      return null;
    }
    if (sign === 1 && value < otherValue) {
      return `"${field.shortLabel}" can't be before "${other.shortLabel}".`;
    }
    if (sign === -1 && value > otherValue) {
      return `"${field.shortLabel}" can't be after "${other.shortLabel}".`;
    }
    return null;
  };
  return compare(field.notBefore, 1) ?? compare(field.notAfter, -1);
};

/**
 * What's wrong with a set of normalised answers, as a message for whoever's
 * filling them in, or null when they can be submitted. A date that can't be
 * in the past may still keep the value it had in `previous`, so an older
 * record can be edited without moving its dates.
 */
export const answersProblem = (
  fields: readonly FormField[],
  answers: FormAnswers,
  today: string,
  previous?: FormAnswers
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
    if (field.kind === "checkboxes" || field.kind === "choice") {
      const chosen = Array.isArray(value) ? value : [value as string];
      const before = previous?.[field.key];
      const had = Array.isArray(before) ? before : [before];
      const retired = (field.options ?? []).find(
        (o) => o.retired && chosen.includes(o.value) && !had.includes(o.value)
      );
      if (retired) {
        return `"${retired.label}" is no longer an option for "${field.shortLabel}".`;
      }
    }
    if (
      field.kind === "checkboxes" &&
      field.otherOption &&
      (value as string[]).includes(field.otherOption) &&
      answers[otherKey(field)] === undefined
    ) {
      return `Say what "Other" is for "${field.shortLabel}".`;
    }
    if (field.kind === "money" || field.kind === "number") {
      const amount = value as number;
      if (amount < 0) return missing(field);
      if (field.max !== undefined && amount > field.max) {
        return field.kind === "money"
          ? `"${field.shortLabel}" can be at most $${formatAmount(field.max)}.`
          : `"${field.shortLabel}" can be at most ${formatAmount(field.max)}.`;
      }
    }
    if (field.kind === "date") {
      const date = value as string;
      if (!isValidDateString(date)) return missing(field);
      if (field.notInPast && date < today && date !== previous?.[field.key]) {
        return `"${field.shortLabel}" can't be in the past.`;
      }
    }
    if (field.kind === "dateTime") {
      const problem = dateTimeProblem(fields, field, answers, today, previous);
      if (problem) return problem;
    }
    if (field.kind === "url" && !isValidUrl(value as string)) {
      return `"${field.shortLabel}" needs to be a full link, starting with https://`;
    }
  }
  return null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Oct 2026" for a YYYY-MM-DD date. */
export const formatDate = (value: string): string => {
  if (!isValidDateString(value)) return value;
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

/** "1:00 pm" for an HH:mm time. */
const formatTime = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad2(minute)} ${suffix}`;
};

/** "12 Jan 2026, 1:00 pm" for a "2026-01-12T13:00" date-time. */
export const formatDateTime = (value: string): string => {
  if (!isValidDateTimeString(value)) return value;
  const [date, time] = value.split("T");
  return `${formatDate(date)}, ${formatTime(time)}`;
};

/**
 * "12–16 Jan 2026" style range for two date-times, with times when it's a
 * single day: "17 Oct 2026, 11:00 am – 5:00 pm".
 */
export const formatDateTimeRange = (start: string, end: string | undefined): string => {
  if (!end || !isValidDateTimeString(start) || !isValidDateTimeString(end)) {
    return formatDateTime(start);
  }
  const [startDate, startTime] = start.split("T");
  const [endDate, endTime] = end.split("T");
  if (startDate === endDate) {
    return `${formatDate(startDate)}, ${formatTime(startTime)} – ${formatTime(endTime)}`;
  }
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
};

/** An answer as it reads on the page and in emails, or null if unanswered. */
export const formatAnswer = (field: FormField, answers: FormAnswers): string | null => {
  const value = answers[field.key];
  if (value === undefined) return null;
  const labelOf = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
  switch (field.kind) {
    case "checkboxes": {
      const other = answers[otherKey(field)];
      return (value as string[])
        .map((v) =>
          v === field.otherOption && typeof other === "string"
            ? `${labelOf(v)}: ${other}`
            : labelOf(v)
        )
        .join(", ");
    }
    case "choice":
      return labelOf(value as string);
    case "money":
      return `$${formatAmount(value as number)}`;
    case "number":
      return formatAmount(value as number);
    case "date":
      return formatDate(value as string);
    case "dateTime":
      return formatDateTime(value as string);
    case "yesNo":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
};

/** The short names of the questions whose answers differ. */
export const changedAnswers = (
  fields: readonly FormField[],
  before: FormAnswers,
  after: FormAnswers
): string[] =>
  fields
    .filter((field) => formatAnswer(field, before) !== formatAnswer(field, after))
    .map((field) => field.shortLabel);

/** The answer to the question with `role`, as text ("" when there's none). */
export const answerForRole = (
  fields: readonly FormField[],
  answers: FormAnswers,
  role: NonNullable<FormField["role"]>
): string => {
  const field = fields.find((f) => f.role === role);
  const value = field ? answers[field.key] : undefined;
  if (field?.kind === "date" || field?.kind === "dateTime") {
    return typeof value === "string" ? value : "";
  }
  return field ? (formatAnswer(field, answers) ?? "") : "";
};
