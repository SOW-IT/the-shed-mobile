// The prebuilt bundle, not "pdf-lib": see pdfLibBundle.d.ts.
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib/dist/pdf-lib.esm.min.js";
import {
  formatAnswer,
  formatDateTimeRange,
  isFieldShown,
  type FormAnswers,
  type FormField,
} from "../../shared/forms";
import {
  EVENT_STATUS_LABELS,
  eventRequestRef,
  financeTotals,
  LIKELIHOOD_GUIDE,
  majorRisks,
  RISK_CATEGORY_LABELS,
  rowScore,
  SUB_FORM_LABELS,
  isRiskLevel,
  type EventRequestStatus,
  type FinanceData,
  type RiskData,
  type SubFormKind,
} from "../../shared/eventRequests";
import { formatAmount } from "../../shared/money";
import { subFormStatusLine, type FormStatusFacts } from "./eventRequestText";
import { sydneyDateTime } from "./sydneyTime";

export type EventRequestPdfInput = {
  data: {
    event: {
      year: number;
      number: number;
      name: string;
      department: string;
      status: EventRequestStatus;
      requesterEmail: string;
      submittedAt: number;
      startsAt: string;
      endsAt: string;
      location: string;
      answers: FormAnswers;
      approvedAt?: number;
      cancelNote?: string;
      legacyKey?: string;
    };
    requesterName: string | null;
    forms: Record<
      SubFormKind,
      FormStatusFacts & { answers?: FormAnswers; risk?: RiskData; finance?: FinanceData }
    >;
  };
  eventFields: readonly FormField[];
  marketingFields: readonly FormField[];
  history: { at: number; label: string; actorName: string; detail: string | null }[];
  /** When the PDF was made, for its footer. */
  generatedAt: number;
};

export const eventRequestPdfFilename = (e: { year: number; number: number; name: string }) =>
  `event-request-${e.year}-${e.number}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

const money = (amount: number) => `${amount < 0 ? "-" : ""}$${formatAmount(Math.abs(amount))}`;

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points
const MARGIN = 45;
const WIDTH = PAGE.width - 2 * MARGIN;
const TEXT = rgb(0.06, 0.15, 0.14);
const MUTED = rgb(0.36, 0.42, 0.38);
const RULE = rgb(0.8, 0.84, 0.82);
// The Governance Review Form's blues.
const BAND = rgb(0.06, 0.27, 0.36);
const HEADER = rgb(0.13, 0.36, 0.6);
const SHADE = rgb(0.86, 0.91, 0.96);
const WHITE = rgb(1, 1, 1);

type Style = { font: PDFFont; size: number; color: typeof TEXT; gap?: number };
type Cell = { text: string; bold?: boolean; fill?: typeof TEXT; color?: typeof TEXT };

/**
 * Lays text and simple tables out top to bottom across as many pages as it
 * needs. The PDF's built-in fonts only cover Western European characters, so
 * anything else (emoji, other scripts) prints as "?" rather than failing.
 */
class Writer {
  pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  private charsets = new Map<PDFFont, Set<number>>();

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont
  ) {
    this.newPage();
  }

  newPage() {
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
    return [...text.replace(/\t/g, "  ").replace(/[–—]/g, "-").replace(/[×]/g, "x")]
      .map((ch) => (ch === "\n" || supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
  }

  /** `text` broken into lines no wider than `width`. */
  wrap(text: string, font: PDFFont, size: number, width = WIDTH): string[] {
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
      this.page.drawText(line, { x: MARGIN, y: this.y, size: style.size, font: style.font, color: style.color });
    }
    this.y -= style.gap ?? 0;
  }

  space(points: number) {
    this.y -= points;
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

  /** A full-width dark band with white text, like the form's section headers. */
  band(title: string) {
    const height = 20;
    if (this.y - height - 40 < MARGIN) this.newPage();
    this.y -= height;
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: WIDTH, height, color: BAND });
    this.page.drawText(this.clean(this.bold, title), {
      x: MARGIN + 8,
      y: this.y + 6,
      size: 11,
      font: this.bold,
      color: WHITE,
    });
  }

  /**
   * Rows of cells with borders; `widths` are fractions of the page width. A
   * row that fits on a page is kept together; one taller than a page (a long
   * risk description) carries on over the next page.
   */
  table(widths: number[], rows: Cell[][], size = 9) {
    const pad = 4;
    const lineHeight = size * 1.3;
    const linesThatFit = () => Math.floor((this.y - MARGIN - 2 * pad) / lineHeight);
    for (const row of rows) {
      let pending = row.map((cell, i) =>
        this.wrap(cell.text, cell.bold ? this.bold : this.regular, size, widths[i] * WIDTH - 2 * pad)
      );
      const fullHeight = Math.max(...pending.map((lines) => lines.length)) * lineHeight + 2 * pad;
      if (this.y - fullHeight < MARGIN && fullHeight <= PAGE.height - 2 * MARGIN) this.newPage();
      while (pending.some((lines) => lines.length > 0)) {
        if (linesThatFit() < 1) this.newPage();
        const fit = linesThatFit();
        const chunk = pending.map((lines) => lines.slice(0, fit));
        pending = pending.map((lines) => lines.slice(fit));
        const height = Math.max(1, ...chunk.map((lines) => lines.length)) * lineHeight + 2 * pad;
        let x = MARGIN;
        row.forEach((cell, i) => {
          const w = widths[i] * WIDTH;
          this.page.drawRectangle({
            x,
            y: this.y - height,
            width: w,
            height,
            color: cell.fill,
            borderColor: TEXT,
            borderWidth: 0.6,
          });
          chunk[i].forEach((line, n) => {
            this.page.drawText(line, {
              x: x + pad,
              y: this.y - pad - (n + 1) * lineHeight + 3,
              size,
              font: cell.bold ? this.bold : this.regular,
              color: cell.color ?? TEXT,
            });
          });
          x += w;
        });
        this.y -= height;
      }
    }
  }
}

const head = (text: string): Cell => ({ text, bold: true, fill: HEADER, color: WHITE });
const value = (text: string): Cell => ({ text, fill: SHADE });
const plain = (text: string): Cell => ({ text });

/**
 * A printable copy of an event request: the event and its Marketing form,
 * then Risk and Finance laid out like SOW's Governance Review Form, then its
 * history.
 */
export async function buildEventRequestPdf(input: EventRequestPdfInput): Promise<Uint8Array> {
  const { event, forms } = input.data;
  const doc = await PDFDocument.create();
  doc.setTitle(event.name);
  doc.setCreator("THE SHED");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, regular, bold);
  const requester = input.data.requesterName ?? event.requesterEmail;
  const statusOf = (kind: SubFormKind) =>
    `${SUB_FORM_LABELS[kind]} form: ${subFormStatusLine(kind, forms[kind], { imported: !!event.legacyKey, canFill: false })}`;

  // ── The event ──
  w.text(event.name, { font: bold, size: 20, color: TEXT, gap: 2 });
  w.text(`Event request ${eventRequestRef(event)}`, { font: regular, size: 11, color: MUTED, gap: 6 });
  w.text(`Status: ${EVENT_STATUS_LABELS[event.status]}`, { font: bold, size: 11, color: TEXT, gap: 3 });
  for (const line of [
    formatDateTimeRange(event.startsAt, event.endsAt),
    event.location,
    `Requested by ${requester} (${event.department}) on ${sydneyDateTime(event.submittedAt)}`,
    ...(event.approvedAt ? [`Approved ${sydneyDateTime(event.approvedAt)}`] : []),
    ...(event.cancelNote ? [`Note: ${event.cancelNote}`] : []),
  ]) {
    w.text(line, { font: regular, size: 10, color: MUTED, gap: 2 });
  }
  const answers = (fields: readonly FormField[], given: FormAnswers) => {
    for (const field of fields) {
      if (!isFieldShown(field, given)) continue;
      w.text(field.shortLabel, { font: bold, size: 9, color: MUTED, gap: 1 });
      w.text(formatAnswer(field, given) ?? "-", { font: regular, size: 10.5, color: TEXT, gap: 6 });
    }
  };
  w.rule();
  w.text("THE EVENT", { font: bold, size: 9, color: MUTED, gap: 6 });
  answers(input.eventFields, event.answers);

  w.rule();
  w.text("MARKETING", { font: bold, size: 9, color: MUTED, gap: 4 });
  w.text(statusOf("marketing"), { font: regular, size: 10, color: MUTED, gap: 6 });
  answers(input.marketingFields, forms.marketing.answers ?? {});

  // ── Governance Review Form: Risk and Finance ──
  w.newPage();
  const risk = forms.risk.risk ?? { noRisks: false, risks: [] };
  const finance = forms.finance.finance ?? { income: [], expenses: [] };
  const totals = financeTotals(finance);
  w.text("Governance Review Form", { font: bold, size: 16, color: TEXT, gap: 2 });
  w.text("Risk and finance for this event, for governance and risk management.", {
    font: regular,
    size: 10,
    color: MUTED,
    gap: 8,
  });
  w.band("1. SUMMARY");
  w.table(
    [0.22, 0.28, 0.22, 0.28],
    [
      [head("Event/Project Title"), { ...value(event.name) }, head("Lead Department"), value(event.department)],
      [head("Total Income"), value(money(totals.income)), head("Contingencies"), value(risk.contingencies ?? "-")],
      [
        head("Total Costs"),
        value(money(totals.expenses)),
        head("Author"),
        value(requester),
      ],
      [
        head("Major risk(s) considered"),
        value(
          risk.noRisks
            ? "None notable"
            : majorRisks(risk).map((c) => RISK_CATEGORY_LABELS[c]).join(", ") || "-"
        ),
        head("Date"),
        value(sydneyDateTime(event.submittedAt)),
      ],
    ]
  );
  w.space(10);
  w.band("2. DETAILS");
  w.table(
    [0.22, 0.78],
    [
      [head("What?"), plain(String(event.answers.purpose ?? "-"))],
      [head("Why?"), plain(String(event.answers.goals ?? "-"))],
    ]
  );
  w.space(10);
  w.band("RISK");
  w.text(statusOf("risk"), { font: regular, size: 9.5, color: MUTED, gap: 4 });
  if (risk.noRisks) {
    w.text("The requester said this event has no notable risks.", { font: regular, size: 10, color: TEXT, gap: 4 });
  } else if (risk.risks.length > 0) {
    w.table(
      [0.36, 0.16, 0.16, 0.32],
      [
        [head("Risk Description"), head("Risk Matrix Score"), head("Likelihood"), head("Mitigation Strategy")],
        ...risk.risks.map((row) => {
          const score = rowScore(row);
          const kind = row.category ? ` (${RISK_CATEGORY_LABELS[row.category]})` : "";
          return [
            plain(`${row.description}${kind}`),
            plain(score ? `${score.score}, ${score.rating}` : (row.legacyRating ?? "-")),
            plain(isRiskLevel(row.likelihood) ? LIKELIHOOD_GUIDE[row.likelihood].label : "-"),
            plain(row.mitigation ?? "-"),
          ];
        }),
      ]
    );
  }
  w.text("Rated with SOW's Risk Management Standard (2026).", { font: regular, size: 8.5, color: MUTED, gap: 8 });

  w.band("FINANCE");
  w.text(statusOf("finance"), { font: regular, size: 9.5, color: MUTED, gap: 4 });
  const lines = (title: string, rows: FinanceData["income"], total: number) =>
    w.table(
      [0.7, 0.3],
      [
        [head(title), head("$")],
        ...rows.map((l) => [plain(l.label), plain(money(l.amount))]),
        [{ text: "TOTAL", bold: true }, { text: money(total), bold: true }],
      ]
    );
  lines("Income", finance.income, totals.income);
  w.space(6);
  lines("Expenses", finance.expenses, totals.expenses);
  w.space(4);
  if (finance.spreadsheetUrl) {
    w.text(`Full rundown of costs: ${finance.spreadsheetUrl}`, { font: regular, size: 9, color: TEXT, gap: 4 });
  }

  if (input.history.length > 0) {
    w.rule();
    w.text("HISTORY", { font: bold, size: 9, color: MUTED, gap: 6 });
    for (const h of input.history) {
      const detail = h.detail ? ` - ${h.detail}` : "";
      w.text(`${sydneyDateTime(h.at)}  ${h.label}, ${h.actorName}${detail}`, {
        font: regular,
        size: 9.5,
        color: TEXT,
        gap: 3,
      });
    }
  }

  const footer = `THE SHED - ${event.name} - downloaded ${sydneyDateTime(input.generatedAt)}`;
  w.pages.forEach((page, i) => {
    page.drawText(`${footer} - page ${i + 1} of ${w.pages.length}`.replace(/[^\x20-\x7E]/g, "?"), {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });
  return await doc.save();
}
