import {
  SUB_FORM_LABELS,
  type FinanceStep,
  type SubFormKind,
  type SubFormStatus,
} from "../../shared/eventRequests";
import { sydneyDateTime } from "./sydneyTime";

/** One line of an event's history, as the page and its PDF show it. */
export const eventHistoryLabel = (action: string, form: SubFormKind | null): string => {
  const name = form ? `${SUB_FORM_LABELS[form]} form` : "Form";
  switch (action) {
    case "created":
      return "Event request created";
    case "edited":
      return "Event edited";
    case "submitted":
      return `${name} sent for approval`;
    case "auto-approved":
      return `${name} approved automatically`;
    case "approved":
      return `${name} approved`;
    case "director-approved":
      return `${name} approved by the Director`;
    case "changes-requested":
      return `Changes requested on the ${name}`;
    case "not-required":
      return `${name}: not required`;
    case "reopened":
      return `${name} reopened`;
    case "event-approved":
      return "Event approved: every form signed off";
    case "cancelled":
      return "Event cancelled";
    case "imported":
      return "Imported from the old SHED";
    default:
      return action;
  }
};

export type FormStatusFacts = {
  status: SubFormStatus;
  step?: FinanceStep;
  approverTitle: string;
  approverName: string | null;
  submittedByName: string | null;
  decidedByName: string | null;
  directorApprovedByName: string | null;
  decidedAt?: number;
  changesReason?: string;
  risk?: { noRisks: boolean };
};

/** Where a form is up to, in a sentence, for its card on the event page. */
export const subFormStatusLine = (
  kind: SubFormKind,
  form: FormStatusFacts,
  opts: { imported: boolean; canFill: boolean }
): string => {
  const on = (at: number | undefined) => (at ? ` on ${sydneyDateTime(at)}` : "");
  switch (form.status) {
    case "DRAFT":
      return opts.canFill ? "Not filled in yet." : "Not submitted yet.";
    case "PENDING": {
      const who = form.approverName ? `${form.approverTitle} (${form.approverName})` : form.approverTitle;
      const director =
        kind === "finance" && form.directorApprovedByName
          ? `Approved by the Director (${form.directorApprovedByName}). `
          : "";
      return `${director}Waiting for ${who}.`;
    }
    case "CHANGES_REQUESTED":
      return `${form.decidedByName ?? "The approver"} asked for changes: ${form.changesReason ?? ""}`.trim();
    case "APPROVED":
      return `Approved${form.decidedByName ? ` by ${form.decidedByName}` : ""}${on(form.decidedAt)}.`;
    case "NOT_REQUIRED":
      if (kind === "finance") return "No money in or out, so Finance doesn't need to approve it.";
      if (form.risk?.noRisks) return "No notable risks, so Compliance doesn't need to approve it.";
      return opts.imported
        ? "Not needed: this event came from the old SHED, which had no Risk form."
        : "Not required.";
  }
};
