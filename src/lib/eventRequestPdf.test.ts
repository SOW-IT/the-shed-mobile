import { PDFDocument } from "pdf-lib";
import { describe, expect, test } from "vitest";
import type { FormField } from "../../shared/forms";
import {
  buildEventRequestPdf,
  eventRequestPdfFilename,
  type EventRequestPdfInput,
} from "./eventRequestPdf";
import { eventHistoryLabel, subFormStatusLine, type FormStatusFacts } from "./eventRequestText";

const AT = Date.UTC(2026, 9, 6, 9, 49);

const FIELDS: FormField[] = [
  { key: "name", kind: "text", label: "Name?", shortLabel: "Event name", required: true },
  { key: "purpose", kind: "longText", label: "Purpose?", shortLabel: "Purpose", required: true },
];
const MARKETING: FormField[] = [
  { key: "keyMessage", kind: "longText", label: "Key?", shortLabel: "Key message", required: true },
];

const facts = (over: Partial<FormStatusFacts> = {}) => ({
  status: "APPROVED",
  approverTitle: "the Finance Head",
  approverName: "Fiona",
  submittedByName: "Eva",
  decidedByName: "Fiona",
  directorApprovedByName: null,
  decidedAt: AT,
  ...over,
}) as Omit<FormStatusFacts, "risk">;

const input = (over: Partial<EventRequestPdfInput["data"]> = {}): EventRequestPdfInput => ({
  data: {
    event: {
      year: 2027,
      number: 3,
      name: "SAF27 – the big one 🎉",
      department: "Events",
      status: "APPROVED",
      requesterEmail: "eva@sow.org.au",
      submittedAt: AT,
      startsAt: "2026-11-14T11:00",
      endsAt: "2026-11-14T17:00",
      location: "Harbour City Church",
      answers: { name: "SAF27", purpose: "Raise funds", goals: "Raise $10k" },
      approvedAt: AT,
    },
    requesterName: "Eva",
    forms: {
      marketing: { ...facts(), answers: { keyMessage: "Give" } },
      risk: {
        ...facts({ approverTitle: "the Compliance Head" }),
        risk: {
          noRisks: false,
          risks: [
            { description: "Trip", category: "safety", consequence: 2, likelihood: 3, mitigation: "Tape" },
            { description: "Old row", legacyRating: "High Risk" },
          ],
          contingencies: "Rain plan",
        },
      },
      finance: {
        ...facts(),
        finance: {
          income: [{ label: "Tickets (100 × $30)", amount: 3000 }],
          expenses: Array.from({ length: 40 }, (_, i) => ({ label: `Line ${i}`, amount: 100 })),
          spreadsheetUrl: "https://example.com/sheet",
        },
      },
    },
    ...over,
  },
  eventFields: FIELDS,
  marketingFields: MARKETING,
  history: [{ at: AT, label: "Event request created", actorName: "Eva", detail: null }],
  generatedAt: AT,
});

describe("event request PDF", () => {
  test("builds a multi-page PDF with the Governance Review Form pages", async () => {
    const bytes = await buildEventRequestPdf(input());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    expect(doc.getTitle()).toBe("SAF27 – the big one 🎉");
  });

  test("copes with no risks and an empty budget", async () => {
    const base = input();
    const bytes = await buildEventRequestPdf({
      ...base,
      data: {
        ...base.data,
        event: { ...base.data.event, status: "CANCELLED", approvedAt: undefined, cancelNote: "Off" },
        forms: {
          ...base.data.forms,
          risk: { ...facts({ status: "NOT_REQUIRED" }), risk: { noRisks: true, risks: [] } },
          finance: { ...facts({ status: "NOT_REQUIRED" }) },
          marketing: { ...facts({ status: "DRAFT" }) },
        },
      },
      history: [],
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  test("a risk longer than a page carries on over the next page", async () => {
    const base = input();
    const long = "Crowd crush near the stage. ".repeat(140); // ~4000 characters
    const bytes = await buildEventRequestPdf({
      ...base,
      data: {
        ...base.data,
        forms: {
          ...base.data.forms,
          risk: {
            ...facts(),
            risk: { noRisks: false, risks: [{ description: long, mitigation: long }] },
          },
        },
      },
    });
    const short = await buildEventRequestPdf(base);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(
      (await PDFDocument.load(short)).getPageCount()
    );
  });

  test("names the file after the event", () => {
    expect(eventRequestPdfFilename({ year: 2027, number: 3, name: "SAF27: The Big One!" })).toBe(
      "event-request-2027-3-saf27-the-big-one.pdf"
    );
  });
});

describe("event request text", () => {
  test("history labels", () => {
    expect(eventHistoryLabel("submitted", "risk")).toBe("Risk form sent for approval");
    expect(eventHistoryLabel("director-approved", "finance")).toBe("Finance form approved by the Director");
    expect(eventHistoryLabel("changes-requested", "marketing")).toBe(
      "Changes requested on the Marketing form"
    );
    expect(eventHistoryLabel("approved", null)).toBe("Form approved");
    for (const action of ["created", "edited", "auto-approved", "not-required", "reopened", "event-approved", "cancelled", "imported"]) {
      expect(eventHistoryLabel(action, "risk")).not.toBe(action);
    }
    expect(eventHistoryLabel("mystery", null)).toBe("mystery");
  });

  test("status lines", () => {
    const opts = { imported: false, canFill: false };
    expect(subFormStatusLine("risk", facts({ status: "DRAFT" }), { imported: false, canFill: true })).toBe(
      "Not filled in yet."
    );
    expect(subFormStatusLine("risk", facts({ status: "DRAFT" }), opts)).toBe("Not submitted yet.");
    expect(
      subFormStatusLine("finance", facts({ status: "PENDING", directorApprovedByName: "Dan" }), opts)
    ).toBe("Approved by the Director (Dan). Waiting for the Finance Head (Fiona).");
    expect(subFormStatusLine("risk", facts({ status: "PENDING", approverName: null, approverTitle: "the Compliance Head" }), opts)).toBe(
      "Waiting for the Compliance Head."
    );
    expect(
      subFormStatusLine("risk", facts({ status: "CHANGES_REQUESTED", changesReason: "More detail" }), opts)
    ).toBe("Fiona asked for changes: More detail");
    expect(subFormStatusLine("risk", facts({ decidedByName: null, decidedAt: undefined }), opts)).toBe("Approved.");
    expect(subFormStatusLine("finance", facts({ status: "NOT_REQUIRED" }), opts)).toMatch(/No money/);
    expect(
      subFormStatusLine("risk", { ...facts({ status: "NOT_REQUIRED" }), risk: { noRisks: true } }, opts)
    ).toMatch(/No notable risks/);
    expect(subFormStatusLine("risk", facts({ status: "NOT_REQUIRED" }), { imported: true, canFill: false })).toMatch(
      /old SHED/
    );
    expect(subFormStatusLine("risk", facts({ status: "NOT_REQUIRED" }), opts)).toBe("Not required.");
  });
});
