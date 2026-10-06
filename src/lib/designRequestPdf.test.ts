import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";
import type { DesignField } from "../../shared/designRequests";
import {
  buildDesignRequestPdf,
  designRequestPdfFilename,
  pdfStatusLines,
  pdfTime,
  type DesignRequestPdfInput,
} from "./designRequestPdf";

const FIELDS: DesignField[] = [
  {
    key: "types",
    kind: "checkboxes",
    label: "Type?",
    shortLabel: "Request type",
    required: true,
    options: [{ value: "event", label: "Event-related" }],
  },
  {
    key: "passage",
    kind: "text",
    label: "Passage?",
    shortLabel: "Bible passage",
    required: true,
    showWhen: { field: "types", includes: "pr" },
  },
  { key: "message", kind: "longText", label: "Message?", shortLabel: "Key message", required: true },
  { key: "notes", kind: "longText", label: "Notes?", shortLabel: "Notes", required: false },
];

const AT = Date.UTC(2026, 9, 6, 9, 49);

const input = (over: Partial<DesignRequestPdfInput> = {}): DesignRequestPdfInput => ({
  request: {
    year: 2027,
    number: 4,
    status: "COMPLETED",
    title: "Poster",
    answers: { types: ["event"], message: "Here I am — send me 🙏 사랑" },
    requesterEmail: "rachel@sow.org.au",
    submittedAt: AT,
    editedAt: AT,
    decidedAt: AT,
    completedAt: AT,
    completionNote: "Files in Drive",
  },
  requesterName: "Rachel",
  decidedByName: "Henry",
  completedByName: null,
  fields: FIELDS,
  history: [{ at: AT, label: "Submitted", actorName: "Rachel", detail: null }],
  comments: [{ at: AT, authorName: "Mary", body: "On it\nThanks" }],
  generatedAt: AT,
  ...over,
});

describe("design request PDF", () => {
  test("names the file by year and number", () => {
    expect(designRequestPdfFilename({ year: 2027, number: 4 })).toBe(
      "design-request-2027-4.pdf"
    );
  });

  test("times are Sydney time with plain spaces", () => {
    expect(pdfTime(AT)).toBe("6 Oct 2026, 8:49 pm");
  });

  test("status lines follow what happened", () => {
    expect(pdfStatusLines(input())).toEqual([
      "Submitted 6 Oct 2026, 8:49 pm by Rachel",
      "Edited 6 Oct 2026, 8:49 pm",
      "Approved 6 Oct 2026, 8:49 pm by Henry",
      "Completed 6 Oct 2026, 8:49 pm",
      "Note: Files in Drive",
    ]);
    const declined = input({
      requesterName: null,
      request: {
        ...input().request,
        status: "DECLINED",
        editedAt: undefined,
        completedAt: undefined,
        completionNote: undefined,
        declineReason: "Out of scope",
      },
    });
    expect(pdfStatusLines(declined)).toEqual([
      "Submitted 6 Oct 2026, 8:49 pm by rachel@sow.org.au",
      "Declined 6 Oct 2026, 8:49 pm by Henry",
      "Reason: Out of scope",
    ]);
    const cancelled = input({
      request: {
        ...input().request,
        status: "CANCELLED",
        editedAt: undefined,
        decidedAt: undefined,
        completedAt: undefined,
        completionNote: undefined,
        cancelledAt: AT,
      },
    });
    expect(pdfStatusLines(cancelled)).toEqual([
      "Submitted 6 Oct 2026, 8:49 pm by Rachel",
      "Cancelled 6 Oct 2026, 8:49 pm",
    ]);
  });

  test("builds a PDF even with characters the font can't draw", async () => {
    const bytes = await buildDesignRequestPdf(input());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("Design request #4 (2027)");
    expect(doc.getPageCount()).toBe(1);
  });

  test("long answers wrap and run onto more pages", async () => {
    const long = `${"word ".repeat(2500)}https://example.com/${"x".repeat(400)}`;
    const bytes = await buildDesignRequestPdf(
      input({
        request: { ...input().request, title: "", answers: { message: long, notes: "\tTabbed" } },
        history: [],
        comments: [],
      })
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });
});
