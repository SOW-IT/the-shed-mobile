import {
  SUB_FORM_LABELS,
  type FinanceStep,
  type SubFormKind,
  type SubFormStatus,
} from "../../shared/eventRequests";
import { sydneyDateTime } from "./sydneyTime";

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
  updatedAt?: number;
  changesReason?: string;
  risk?: { noRisks: boolean };
};

export const subFormStatusLine = (
  kind: SubFormKind,
  form: FormStatusFacts,
  opts: { imported: boolean; canFill: boolean; canDecide?: boolean }
): string => {
  const on = (at: number | undefined) => (at ? ` on ${sydneyDateTime(at)}` : "");
  const director =
    kind === "finance" && form.directorApprovedByName
      ? `Approved by the Director (${form.directorApprovedByName}). `
      : "";
  switch (form.status) {
    case "DRAFT":
      if (!opts.canFill) return "Not submitted yet.";
      return form.updatedAt
        ? `Draft saved${on(form.updatedAt)}. Not submitted yet.`
        : "Not filled in yet.";
    case "PENDING": {
      const who = form.approverName ? `${form.approverTitle} (${form.approverName})` : form.approverTitle;
      return `${director}Waiting for ${opts.canDecide ? "your approval" : who}.`;
    }
    case "CHANGES_REQUESTED":
      return `${form.decidedByName ?? "The approver"} asked for changes: ${form.changesReason ?? ""}`.trim();
    case "APPROVED":
      return `${director}Approved${form.decidedByName ? ` by ${form.decidedByName}` : ""}${on(form.decidedAt)}.`;
    case "NOT_REQUIRED":
      if (kind === "finance") return "No money in or out, so Finance doesn't need to approve it.";
      if (form.risk?.noRisks) return "No notable risks, so Compliance doesn't need to approve it.";
      return opts.imported
        ? "Not needed: this event came from the old SHED, which had no Risk form."
        : "Not required.";
  }
};

export const subFormCardLine = (
  kind: SubFormKind,
  form: FormStatusFacts,
  opts: { imported: boolean; canFill: boolean; canDecide?: boolean }
): string | null => {
  if (form.status === "DRAFT") {
    return opts.canFill && form.updatedAt ? `Draft saved on ${sydneyDateTime(form.updatedAt)}.` : null;
  }
  if (form.status === "NOT_REQUIRED" && kind !== "finance" && !form.risk?.noRisks && !opts.imported) return null;
  return subFormStatusLine(kind, form, opts);
};
