import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test, vi } from "vitest";
import { MARGIN, MUTED, PAGE, PdfWriter } from "./pdfWriter";

class Probe extends PdfWriter {
  get top() {
    return this.y;
  }
  dropTo(y: number) {
    this.y = y;
  }
}

const HEADING = { size: 9, color: MUTED, gap: 6 };

describe("PdfWriter", () => {
  test("a heading near the page bottom takes its rule to the next page", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new Probe(doc);
    w.dropTo(MARGIN + 20);
    w.heading("HISTORY", { font, ...HEADING });
    expect(w.pages).toHaveLength(2);
    expect(w.top).toBeCloseTo(PAGE.height - MARGIN - 16 - 9 * 1.35 - 6, 5);
  });

  test("a heading with room for its rule and a line stays on the page", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new Probe(doc);
    w.dropTo(MARGIN + 40);
    w.heading("HISTORY", { font, ...HEADING });
    expect(w.pages).toHaveLength(1);
    expect(w.top).toBeCloseTo(MARGIN + 40 - 16 - 9 * 1.35 - 6, 5);
  });

  test("keepWithNext moves a heading whose first line would not fit", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new Probe(doc);
    w.dropTo(MARGIN + 40);
    w.heading("HISTORY", { font, ...HEADING }, 30);
    expect(w.pages).toHaveLength(2);
  });

  test("keepWithNext counts the heading's gap, so the next block still fits under it", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new Probe(doc);
    w.dropTo(MARGIN + 16 + 9 * 1.35 + 20);
    w.heading("HISTORY", { font, ...HEADING }, 20);
    expect(w.pages).toHaveLength(2);
  });

  test("a label kept with its answer counts its gap too", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const w = new Probe(doc);
    w.dropTo(MARGIN + 9 * 1.35 + 12);
    w.text("Answer", { font, ...HEADING }, 12);
    expect(w.pages).toHaveLength(2);
    w.dropTo(MARGIN + 9 * 1.35 + 12);
    w.text("Answer", { font, ...HEADING });
    expect(w.pages).toHaveLength(2);
  });

  test("the footer keeps the letters the font can draw", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const w = new Probe(doc);
    const drawn: string[] = [];
    vi.spyOn(w.pages[0], "drawText").mockImplementation((text) => {
      drawn.push(text);
    });
    w.footer("THE SHED - Zoë's poster — downloaded 16 Oct 🙏", font);
    expect(drawn).toEqual(["THE SHED - Zoë's poster - downloaded 16 Oct ? - page 1 of 1"]);
  });
});
