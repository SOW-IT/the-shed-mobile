import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib/dist/pdf-lib.esm.min.js";

export const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = 45;
export const WIDTH = PAGE.width - 2 * MARGIN;
export const TEXT = rgb(0.06, 0.15, 0.14);
export const MUTED = rgb(0.36, 0.42, 0.38);
const RULE = rgb(0.8, 0.84, 0.82);
const RULE_HEIGHT = 16;

type Style = { font: PDFFont; size: number; color: typeof TEXT; gap?: number };

export class PdfWriter {
  pages: PDFPage[] = [];
  protected page!: PDFPage;
  protected y = 0;
  private charsets = new Map<PDFFont, Set<number>>();

  constructor(private doc: PDFDocument) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.pages.push(this.page);
    this.y = PAGE.height - MARGIN;
  }

  protected clean(font: PDFFont, text: string) {
    let supported = this.charsets.get(font);
    if (!supported) {
      supported = new Set(font.getCharacterSet());
      this.charsets.set(font, supported);
    }
    return [...text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(/[–—]/g, "-").replace(/[×]/g, "x")]
      .map((ch) => (ch === "\n" || supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
  }

  wrap(text: string, font: PDFFont, size: number, width = WIDTH): string[] {
    const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width;
    const lines: string[] = [];
    for (const paragraph of this.clean(font, text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
          line = candidate;
          continue;
        }
        if (line) lines.push(line);
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

  text(text: string, style: Style, keepWithNext = 0) {
    const lineHeight = style.size * 1.35;
    const reserved = keepWithNext > 0 ? keepWithNext + (style.gap ?? 0) : 0;
    if (this.y - lineHeight - reserved < MARGIN) this.newPage();
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

  heading(text: string, style: Style, keepWithNext = 0) {
    const lineHeight = style.size * 1.35;
    if (this.y - RULE_HEIGHT - lineHeight - (style.gap ?? 0) - keepWithNext < MARGIN) this.newPage();
    this.rule();
    this.text(text, style, keepWithNext);
  }

  rule() {
    if (this.y - RULE_HEIGHT < MARGIN) this.newPage();
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 8;
  }

  footer(label: string, font: PDFFont) {
    this.pages.forEach((page, i) => {
      page.drawText(this.clean(font, `${label} - page ${i + 1} of ${this.pages.length}`).replace(/\n/g, " "), {
        x: MARGIN,
        y: MARGIN / 2,
        size: 8,
        font,
        color: MUTED,
      });
    });
  }
}
