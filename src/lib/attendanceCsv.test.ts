import { describe, expect, test } from "vitest";
import {
  buildAttendanceCsv,
  exportSlug,
  type ExportEventForCsv,
} from "./attendanceCsv";

const at = (iso: string) => new Date(iso).getTime();

const baseEvent = (
  overrides: Partial<ExportEventForCsv> = {}
): ExportEventForCsv => ({
  _id: "e1",
  name: "Weekly Meeting",
  dateStart: at("2026-03-04T17:00:00"),
  dateEnd: at("2026-03-04T19:00:00"),
  subgroups: ["University of Sydney"],
  collaborative: false,
  collaborators: [],
  tags: ["Weekly"],
  attendanceCount: 1,
  rows: [
    {
      name: "Ada Lovelace",
      email: "ada@sow.org.au",
      signInTime: at("2026-03-04T17:05:00"),
      notes: "early",
      metadata: { Gender: "Female", Campus: "University of Sydney" },
    },
  ],
  ...overrides,
});

describe("buildAttendanceCsv", () => {
  test("writes an event-level info block, then a per-attendee table", () => {
    const csv = buildAttendanceCsv([baseEvent()], ["Gender", "Campus"]);
    const lines = csv.split("\r\n");
    // Event info is written once for the event, not repeated per person.
    expect(lines.slice(0, 5)).toEqual([
      "Event,Weekly Meeting",
      "Start Date,04.03.2026 17:00",
      "End Date,04.03.2026 19:00",
      "Tags,Weekly",
      "Collaboration,",
    ]);
    expect(lines[5]).toBe(""); // blank line between info and table
    expect(lines[6]).toBe("Sign In,Name,Email,Gender,Campus,Notes");
    expect(lines[7]).toBe(
      "04.03.2026 17:05,Ada Lovelace,ada@sow.org.au,Female,University of Sydney,early"
    );
  });

  test("a metadata field named 'Notes' doesn't duplicate the sign-in Notes column", () => {
    // The reserved trailing "Notes" column holds the sign-in note; a same-named
    // metadata field must be dropped so the export has exactly one "Notes".
    const event = baseEvent({
      rows: [
        {
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          notes: "sign-in note",
          metadata: { Gender: "Female", Notes: "metadata note" },
        },
      ],
    });
    const lines = buildAttendanceCsv([event], ["Gender", "Notes"]).split("\r\n");
    const header = lines[6];
    // Exactly one "Notes" column, and it's the trailing reserved one.
    expect(header).toBe("Sign In,Name,Email,Gender,Notes");
    expect(header.split(",").filter((c) => c === "Notes")).toHaveLength(1);
    // The row carries the sign-in note there, not the metadata note.
    expect(lines[7]).toBe(
      "04.03.2026 17:05,Ada Lovelace,ada@sow.org.au,Female,sign-in note"
    );
  });

  test("collaboration is listed once in the info block", () => {
    const event = baseEvent({
      collaborative: true,
      collaborators: ["Macquarie University"],
    });
    const lines = buildAttendanceCsv([event], []).split("\r\n");
    expect(lines).toContain("Collaboration,MACQ");
  });

  test("only includes the metadata columns that were chosen", () => {
    const csv = buildAttendanceCsv([baseEvent()], ["Gender"]);
    const lines = csv.split("\r\n");
    const header = lines.find((l) => l.startsWith("Sign In,"))!;
    const row = lines[lines.length - 1];
    expect(header).toBe("Sign In,Name,Email,Gender,Notes");
    // Campus column is dropped because it wasn't selected.
    expect(row).not.toContain("University of Sydney");
    expect(row).toContain("Female");
  });

  test("a missing metadata value becomes an empty cell", () => {
    const event = baseEvent({
      rows: [
        {
          name: "No Meta",
          email: "nm@sow.org.au",
          signInTime: at("2026-03-04T17:10:00"),
          metadata: {},
        },
      ],
    });
    const lines = buildAttendanceCsv([event], ["Gender"]).split("\r\n");
    const row = lines[lines.length - 1];
    expect(row.endsWith(",,")).toBe(true); // empty Gender + empty Notes
  });

  test("multiple events become separate sections", () => {
    const a = baseEvent({ _id: "a", name: "Event A" });
    const b = baseEvent({ _id: "b", name: "Event B" });
    const sections = buildAttendanceCsv([a, b], []).split("\r\n\r\n\r\n");
    expect(sections).toHaveLength(2);
    expect(sections[0].startsWith("Event,Event A\r\n")).toBe(true);
    expect(sections[1].startsWith("Event,Event B\r\n")).toBe(true);
  });

  test("an event with no attendance still appears as an info block + header", () => {
    const event = baseEvent({ rows: [], attendanceCount: 0 });
    const lines = buildAttendanceCsv([event], ["Gender"]).split("\r\n");
    // 5 info rows + blank + table header, no data rows.
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("Event,Weekly Meeting");
    expect(lines[6]).toBe("Sign In,Name,Email,Gender,Notes");
  });

  test("defangs formula-injection and escapes commas/quotes", () => {
    const event = baseEvent({
      name: "=cmd|calc",
      rows: [
        {
          name: 'Smith, "Bob"',
          email: "bob@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: {},
        },
      ],
    });
    const lines = buildAttendanceCsv([event], []).split("\r\n");
    expect(lines[0]).toBe("Event,'=cmd|calc"); // formula trigger neutralised
    expect(lines[lines.length - 1]).toContain('"Smith, ""Bob"""'); // escaped
  });
});

describe("exportSlug", () => {
  test("slugifies labels and falls back when empty", () => {
    expect(exportSlug("University of Sydney")).toBe("University-of-Sydney");
    expect(exportSlug("SOW")).toBe("SOW");
    expect(exportSlug("***")).toBe("export");
  });
});
