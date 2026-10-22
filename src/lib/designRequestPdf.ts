import { PDFDocument, StandardFonts } from "pdf-lib/dist/pdf-lib.esm.min.js";
import {
  DESIGN_STATUS_LABELS,
  designRequestName,
  formatDesignAnswer,
  isFieldShown,
  type DesignAnswers,
  type DesignField,
  type DesignRequestStatus,
} from "../../shared/designRequests";
import { MUTED, PdfWriter, TEXT } from "./pdfWriter";
import { sydneyDateTime } from "./sydneyTime";

export type DesignRequestPdfInput = {
  request: {
    year: number;
    number: number;
    status: DesignRequestStatus;
    title: string;
    answers: DesignAnswers;
    requesterEmail: string;
    submittedAt: number;
    editedAt?: number;
    decidedAt?: number;
    declineReason?: string;
    completedAt?: number;
    completionNote?: string;
    cancelledAt?: number;
  };
  requesterName: string | null;
  decidedByName: string | null;
  completedByName: string | null;
  fields: readonly DesignField[];
  history: { at: number; label: string; actorName: string; detail: string | null }[];
  comments: { at: number; authorName: string; body: string }[];
  generatedAt: number;
};

export const designRequestPdfFilename = (r: { year: number; number: number }) =>
  `design-request-${r.year}-${r.number}.pdf`;

export const pdfTime = sydneyDateTime;

export const pdfStatusLines = (input: DesignRequestPdfInput): string[] => {
  const { request } = input;
  const by = (name: string | null) => (name ? ` by ${name}` : "");
  const lines = [
    `Submitted ${pdfTime(request.submittedAt)} by ${input.requesterName ?? request.requesterEmail}`,
  ];
  if (request.editedAt) lines.push(`Edited ${pdfTime(request.editedAt)}`);
  if (request.decidedAt && (request.status === "APPROVED" || request.status === "COMPLETED")) {
    lines.push(`Approved ${pdfTime(request.decidedAt)}${by(input.decidedByName)}`);
  }
  if (request.decidedAt && request.status === "DECLINED") {
    lines.push(`Declined ${pdfTime(request.decidedAt)}${by(input.decidedByName)}`);
  }
  if (request.declineReason) lines.push(`Reason: ${request.declineReason}`);
  if (request.completedAt) {
    lines.push(`Completed ${pdfTime(request.completedAt)}${by(input.completedByName)}`);
  }
  if (request.completionNote) lines.push(`Note: ${request.completionNote}`);
  if (request.cancelledAt) lines.push(`Cancelled ${pdfTime(request.cancelledAt)}`);
  return lines;
};

export async function buildDesignRequestPdf(input: DesignRequestPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const name = designRequestName(input.request);
  doc.setTitle(name);
  doc.setCreator("THE SHED");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new PdfWriter(doc);

  const heading = (text: string) =>
    w.heading(text.toUpperCase(), { font: bold, size: 9, color: MUTED, gap: 6 }, 30);
  const LINE = 11 * 1.35;

  w.text(name, { font: bold, size: 20, color: TEXT, gap: 4 });
  if (input.request.title) {
    w.text(input.request.title, { font: regular, size: 12, color: MUTED, gap: 8 });
  }
  w.text(`Status: ${DESIGN_STATUS_LABELS[input.request.status]}`, {
    font: bold,
    size: 11,
    color: TEXT,
    gap: 4,
  });
  for (const line of pdfStatusLines(input)) {
    w.text(line, { font: regular, size: 10, color: MUTED, gap: 2 });
  }

  heading("Answers");
  for (const field of input.fields) {
    if (!isFieldShown(field, input.request.answers)) continue;
    w.text(field.shortLabel, { font: bold, size: 9, color: MUTED, gap: 1 }, LINE);
    w.text(formatDesignAnswer(field, input.request.answers) ?? "-", {
      font: regular,
      size: 11,
      color: TEXT,
      gap: 8,
    });
  }

  if (input.history.length > 0) {
    heading("History");
    for (const event of input.history) {
      const detail = event.detail ? ` - ${event.detail}` : "";
      w.text(`${pdfTime(event.at)}  ${event.label}, ${event.actorName}${detail}`, {
        font: regular,
        size: 10,
        color: TEXT,
        gap: 3,
      });
    }
  }

  if (input.comments.length > 0) {
    heading("Comments");
    for (const comment of input.comments) {
      w.text(`${comment.authorName} - ${pdfTime(comment.at)}`, { font: bold, size: 9, color: MUTED, gap: 1 }, LINE);
      w.text(comment.body, { font: regular, size: 11, color: TEXT, gap: 8 });
    }
  }

  w.footer(`THE SHED - ${name} - downloaded ${pdfTime(input.generatedAt)}`, regular);
  return await doc.save();
}
