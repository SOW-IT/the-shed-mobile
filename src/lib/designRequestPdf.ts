// The prebuilt bundle, not "pdf-lib": see pdfLibBundle.d.ts.
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib/dist/pdf-lib.esm.min.js";
import {
  DESIGN_STATUS_LABELS,
  designRequestName,
  formatDesignAnswer,
  isFieldShown,
  type DesignAnswers,
  type DesignField,
  type DesignRequestStatus,
} from "../../shared/designRequests";
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
  /** When the PDF was made, for its footer. */
  generatedAt: number;
};

export const designRequestPdfFilename = (r: { year: number; number: number }) =>
  `design-request-${r.year}-${r.number}.pdf`;

/** "6 Oct 2026, 8:49 pm", always in Sydney time so every copy reads the same. */
export const pdfTime = sydneyDateTime;

/** What happened to the request, one line each, as the request page shows it. */
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

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points
const MARGIN = 50;
const TEXT = rgb(0.06, 0.15, 0.14);
const MUTED = rgb(0.36, 0.42, 0.38);
const RULE = rgb(0.85, 0.88, 0.84);

type Style = { font: PDFFont; size: number; color: typeof TEXT; gap?: number };

/**
 * Lays text out top to bottom across as many pages as it needs. The PDF's
 * built-in fonts only cover Western European characters, so anything else
 * (emoji, other scripts) prints as "?" rather than failing the whole file.
 */
class Writer {
  pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  private charsets = new Map<PDFFont, Set<number>>();

  constructor(private doc: PDFDocument) {
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN;
  }

  private clean(font: PDFFont, text: string) {
    let supported = this.charsets.get(font);
    if (!supported) {
      supported = new Set(font.getCharacterSet());
      this.charsets.set(font, supported);
    }
    return [...text.replace(/\t/g, "  ")]
      .map((ch) => (supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
  }

  /** `text` broken into lines that fit the page width. */
  private wrap(text: string, font: PDFFont, size: number): string[] {
    const width = PAGE.width - 2 * MARGIN;
    const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
    const lines: string[] = [];
    for (const paragraph of this.clean(font, text).split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
        // A word longer than the line (a long link) is split by character.
        line = "";
        for (const ch of word) {
          if (!fits(line + ch)) {
            lines.push(line);
            line = "";
          }
          line += ch;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, style: Style) {
    const lineHeight = style.size * 1.35;
    for (const line of this.wrap(text, style.font, style.size)) {
      if (this.y - lineHeight < MARGIN) this.newPage();
      this.y -= lineHeight;
      this.page.drawText(line, {
        x: MARGIN,
        y: this.y,
        size: style.size,
        font: style.font,
        color: style.color,
      });
    }
    this.y -= style.gap ?? 0;
  }

  rule() {
    if (this.y - 16 < MARGIN) this.newPage();
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 8;
  }
}

/** A printable copy of a design request: status, every answer, history and comments. */
export async function buildDesignRequestPdf(input: DesignRequestPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const name = designRequestName(input.request);
  doc.setTitle(name);
  doc.setCreator("THE SHED");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc);

  const heading = (text: string) => {
    w.rule();
    w.text(text.toUpperCase(), { font: bold, size: 9, color: MUTED, gap: 6 });
  };

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
    w.text(field.shortLabel, { font: bold, size: 9, color: MUTED, gap: 1 });
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
      w.text(`${comment.authorName} - ${pdfTime(comment.at)}`, {
        font: bold,
        size: 9,
        color: MUTED,
        gap: 1,
      });
      w.text(comment.body, { font: regular, size: 11, color: TEXT, gap: 8 });
    }
  }

  const footer = `THE SHED - ${name} - downloaded ${pdfTime(input.generatedAt)}`;
  w.pages.forEach((page, i) => {
    page.drawText(`${footer} - page ${i + 1} of ${w.pages.length}`, {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });
  return await doc.save();
}
