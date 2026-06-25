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
  test("titles each section with the event name; split Start/End Date columns", () => {
    const csv = buildAttendanceCsv([baseEvent()], ["Gender", "Campus"]);
    const [title, header, row] = csv.split("\r\n");
    // Event name is the section title, not a column.
    expect(title).toBe("Weekly Meeting");
    expect(header).toBe(
      "Start Date,End Date,Tags,Collaboration,Sign In,Name,Email,Gender,Campus,Notes"
    );
    expect(row).toBe(
      "04.03.2026 17:00,04.03.2026 19:00,Weekly,,04.03.2026 17:05,Ada Lovelace,ada@sow.org.au,Female,University of Sydney,early"
    );
  });

  test("only includes the metadata columns that were chosen", () => {
    const csv = buildAttendanceCsv([baseEvent()], ["Gender"]);
    const [, header, row] = csv.split("\r\n");
    expect(header).toBe(
      "Start Date,End Date,Tags,Collaboration,Sign In,Name,Email,Gender,Notes"
    );
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
    const row = buildAttendanceCsv([event], ["Gender"]).split("\r\n")[2];
    expect(row.endsWith(",,")).toBe(true); // empty Gender + empty Notes
  });

  test("collaboration column lists the other sub-groups", () => {
    const event = baseEvent({
      collaborative: true,
      collaborators: ["Macquarie University"],
    });
    const row = buildAttendanceCsv([event], []).split("\r\n")[2];
    expect(row).toContain("MACQ");
  });

  test("multiple events become separate titled sections", () => {
    const a = baseEvent({ _id: "a", name: "Event A" });
    const b = baseEvent({ _id: "b", name: "Event B" });
    const sections = buildAttendanceCsv([a, b], []).split("\r\n\r\n");
    expect(sections).toHaveLength(2);
    expect(sections[0].startsWith("Event A\r\nStart Date,")).toBe(true);
    expect(sections[1].startsWith("Event B\r\nStart Date,")).toBe(true);
  });

  test("an event with no attendance still appears as a titled, header-only section", () => {
    const event = baseEvent({ rows: [], attendanceCount: 0 });
    const lines = buildAttendanceCsv([event], ["Gender"]).split("\r\n");
    expect(lines).toHaveLength(2); // title + header, no data rows
    expect(lines[0]).toBe("Weekly Meeting");
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
    expect(lines[0]).toBe("'=cmd|calc"); // title's formula trigger neutralised
    expect(lines[2]).toContain('"Smith, ""Bob"""'); // comma + quotes escaped
  });
});

describe("exportSlug", () => {
  test("slugifies labels and falls back when empty", () => {
    expect(exportSlug("University of Sydney")).toBe("University-of-Sydney");
    expect(exportSlug("SOW")).toBe("SOW");
    expect(exportSlug("***")).toBe("export");
  });
});
