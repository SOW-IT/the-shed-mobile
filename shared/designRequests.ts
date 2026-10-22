import {
  answerForRole,
  type FormAnswers,
  type FormField,
} from "./forms";

export const MARKETING = "Marketing";

export const MARKETING_TEAM_EMAIL = "marketing@sow.org.au";

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

type DesignStepState = "done" | "declined" | "current" | "todo";

type DesignStep = {
  key: "submitted" | "decided" | "completed";
  label: string;
  state: DesignStepState;
  name: string | null;
  at: number | null;
};

export const designStepTrack = (
  request: {
    status: DesignRequestStatus;
    submittedAt: number;
    decidedAt?: number;
    completedAt?: number;
  },
  names: { requester: string; decidedBy: string | null; completedBy: string | null }
): DesignStep[] => {
  const { status } = request;
  const declined = status === "DECLINED";
  const decided = declined || status === "APPROVED" || status === "COMPLETED";
  const completed = status === "COMPLETED";
  return [
    { key: "submitted", label: "Submitted", state: "done", name: names.requester, at: request.submittedAt },
    {
      key: "decided",
      label: declined ? "Declined" : "Approved",
      state: declined ? "declined" : decided ? "done" : status === "PENDING" ? "current" : "todo",
      name: decided ? names.decidedBy : null,
      at: decided ? (request.decidedAt ?? null) : null,
    },
    {
      key: "completed",
      label: "Complete",
      state: completed ? "done" : status === "APPROVED" ? "current" : "todo",
      name: completed ? names.completedBy : null,
      at: completed ? (request.completedAt ?? null) : null,
    },
  ];
};

export const isOpenDesignStatus = (status: DesignRequestStatus): boolean =>
  status === "PENDING" || status === "APPROVED";

export type DesignAnswers = FormAnswers;
export type DesignField = FormField;

export {
  answersProblem as designAnswersProblem,
  answersProblemAt as designAnswersProblemAt,
  changedAnswers as changedDesignAnswers,
  formatAnswer as formatDesignAnswer,
  formatDate as formatDueDate,
  isFieldShown,
  isValidDateString,
  MAX_ANSWER_LENGTH,
  normalizeAnswers as normalizeDesignAnswers,
  otherKey,
  questionNumber,
  sydneyToday,
} from "./forms";

export const designRequestFiling = (
  fields: readonly FormField[],
  answers: FormAnswers
): { department: string; dueDate: string; title: string } => ({
  department: answerForRole(fields, answers, "department"),
  dueDate: answerForRole(fields, answers, "dueDate"),
  title: answerForRole(fields, answers, "title"),
});

export const designRequestName = (r: { year: number; number: number }): string =>
  `Design request #${r.number} (${r.year})`;
