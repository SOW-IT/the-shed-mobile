import {
  answerForRole,
  type FormAnswer,
  type FormAnswers,
  type FormField,
  type FormFieldKind,
  type FormFieldOption,
} from "./forms";

/** The department that receives design requests; its head approves them. */
export const MARKETING = "Marketing";

/** The Marketing team's shared inbox: it gets the team's design request emails. */
export const MARKETING_TEAM_EMAIL = "marketing@sow.org.au";

/** The first staff year THE SHED took design requests (imported from the old web app). */
export const EARLIEST_DESIGN_REQUEST_YEAR = 2022;

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
// and sent to the app, which renders whatever it's given. The engine that
// checks and formats answers is shared with event requests (shared/forms.ts);
// these are its design-request names.

export type DesignAnswer = FormAnswer;
export type DesignAnswers = FormAnswers;
export type DesignFieldKind = FormFieldKind;
export type DesignFieldOption = FormFieldOption;
export type DesignField = FormField;

export {
  answersProblem as designAnswersProblem,
  changedAnswers as changedDesignAnswers,
  formatAnswer as formatDesignAnswer,
  formatDate as formatDueDate,
  isFieldShown,
  isValidDateString,
  MAX_ANSWER_LENGTH,
  normalizeAnswers as normalizeDesignAnswers,
  otherKey,
  sydneyToday,
} from "./forms";

/** What a request is filed under, taken from the questions that have those roles. */
export const designRequestFiling = (
  fields: readonly FormField[],
  answers: FormAnswers
): { department: string; dueDate: string; title: string } => ({
  department: answerForRole(fields, answers, "department"),
  dueDate: answerForRole(fields, answers, "dueDate"),
  title: answerForRole(fields, answers, "title"),
});

/** How a request is named in lists, emails and notifications. */
export const designRequestName = (r: { year: number; number: number }): string =>
  `Design request #${r.number} (${r.year})`;
