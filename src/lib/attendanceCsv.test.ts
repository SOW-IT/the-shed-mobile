import { describe, expect, test } from "vitest";
import {
  ATTENDANCE_PCT_HEADER,
  buildAttendanceCsv,
  buildAttendanceMatrixCsv,
  exportSlug,
  NOTES_HEADER,
  type ExportEventForCsv,
} from "./attendanceCsv";

const at = (iso: string) => new Date(iso).getTime();

/** Build an export row with a stable identityKey (never name-only). */
const exportRow = (row: {
  name: string;
  email?: string;
  signInTime: number;
  notes?: string;
  metadata?: Record<string, string>;
  /** Override identity; defaults to email:… or member/row keys when given. */
  identityKey?: string;
  memberId?: string;
  attendanceId?: string;
}): ExportEventForCsv["rows"][number] => {
  const email = row.email ?? "";
  const identityKey =
    row.identityKey ??
    (email.trim()
      ? `email:${email.trim().toLowerCase()}`
      : row.memberId
        ? `member:${row.memberId}`
        : `row:${row.attendanceId ?? String(row.signInTime)}`);
  return {
    name: row.name,
    email,
    signInTime: row.signInTime,
    notes: row.notes,
    metadata: row.metadata ?? {},
    identityKey,
  };
};

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
    exportRow({
      name: "Ada Lovelace",
      email: "ada@sow.org.au",
      signInTime: at("2026-03-04T17:05:00"),
      notes: "early",
      metadata: { Gender: "Female", Campus: "University of Sydney" },
    }),
  ],
  ...overrides,
});

describe("buildAttendanceCsv", () => {
  test("writes an event-level info block, then a per-attendee table", () => {
    const csv = buildAttendanceCsv([baseEvent()], ["Gender", "Campus", NOTES_HEADER]);
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
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          notes: "sign-in note",
          metadata: { Gender: "Female", Notes: "metadata note" },
        }),
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
    const csv = buildAttendanceCsv([baseEvent()], ["Gender", NOTES_HEADER]);
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
        exportRow({
          name: "No Meta",
          email: "nm@sow.org.au",
          signInTime: at("2026-03-04T17:10:00"),
          metadata: {},
        }),
      ],
    });
    const lines = buildAttendanceCsv([event], ["Gender", NOTES_HEADER]).split("\r\n");
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

  test("notes can be unselected", () => {
    const lines = buildAttendanceCsv([baseEvent()], ["Gender"]).split("\r\n");
    const header = lines.find((l) => l.startsWith("Sign In,"))!;
    const row = lines[lines.length - 1];
    expect(header).toBe("Sign In,Name,Email,Gender");
    expect(row).toBe("04.03.2026 17:05,Ada Lovelace,ada@sow.org.au,Female");
  });

  test("an event with no attendance still appears as an info block + header", () => {
    const event = baseEvent({ rows: [], attendanceCount: 0 });
    const lines = buildAttendanceCsv([event], ["Gender", NOTES_HEADER]).split("\r\n");
    // 5 info rows + blank + table header, no data rows.
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("Event,Weekly Meeting");
    expect(lines[6]).toBe("Sign In,Name,Email,Gender,Notes");
  });

  test("defangs formula-injection and escapes commas/quotes", () => {
    const event = baseEvent({
      name: "=cmd|calc",
      rows: [
        exportRow({
          name: 'Smith, "Bob"',
          email: "bob@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: {},
        }),
      ],
    });
    const lines = buildAttendanceCsv([event], []).split("\r\n");
    expect(lines[0]).toBe("Event,'=cmd|calc"); // formula trigger neutralised
    expect(lines[lines.length - 1]).toContain('"Smith, ""Bob"""'); // escaped
  });
});

describe("buildAttendanceMatrixCsv", () => {
  const eventA = (): ExportEventForCsv =>
    baseEvent({
      _id: "a",
      name: "Week 1",
      dateStart: at("2026-03-04T17:00:00"),
      attendanceCount: 2,
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: { Gender: "Female", Role: "Student Leader" },
        }),
        exportRow({
          name: "Bob Smith",
          email: "bob@sow.org.au",
          signInTime: at("2026-03-04T17:10:00"),
          metadata: { Gender: "Male", Role: "Staff" },
        }),
      ],
    });

  const eventB = (): ExportEventForCsv =>
    baseEvent({
      _id: "b",
      name: "Week 2",
      dateStart: at("2026-03-11T17:00:00"),
      attendanceCount: 1,
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-11T17:05:00"),
          metadata: { Gender: "Female", Role: "Student Leader" },
        }),
      ],
    });

  test("rows are people, columns are events, with attendance % and Y marks", () => {
    const lines = buildAttendanceMatrixCsv(
      [eventA(), eventB()],
      ["Gender", "Role", NOTES_HEADER]
    ).split("\r\n");

    // Totals align under the event columns (after Name, Email, Gender, Role, %).
    expect(lines[0]).toBe("Total Attendance,,,,,2,1");
    // Notes are dropped from the matrix even if selected.
    expect(lines[1]).toBe(
      `Name,Email,Gender,Role,${ATTENDANCE_PCT_HEADER},Week 1,Week 2`
    );
    // Sorted by name: Ada then Bob. Ada attended both → 100%; Bob only Week 1 → 50%.
    expect(lines[2]).toBe(
      "Ada Lovelace,ada@sow.org.au,Female,Student Leader,100%,Y,Y"
    );
    expect(lines[3]).toBe("Bob Smith,bob@sow.org.au,Male,Staff,50%,Y,");
    expect(lines).toHaveLength(4);
  });

  test("people without email still appear (keyed by member/row identity)", () => {
    const guestOnly = baseEvent({
      _id: "g",
      name: "Welcome",
      attendanceCount: 1,
      rows: [
        exportRow({
          name: "Guest Person",
          email: "",
          signInTime: at("2026-03-04T17:00:00"),
          metadata: { Gender: "Female" },
          memberId: "m-guest",
        }),
      ],
    });
    const lines = buildAttendanceMatrixCsv([guestOnly], ["Gender"]).split(
      "\r\n"
    );
    expect(lines[2]).toBe("Guest Person,,Female,100%,Y");
  });

  test("duplicate event names get a date suffix on the column header", () => {
    const a = baseEvent({
      _id: "a",
      name: "Weekly",
      dateStart: at("2026-03-04T17:00:00"),
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: {},
        }),
      ],
    });
    const b = baseEvent({
      _id: "b",
      name: "Weekly",
      dateStart: at("2026-03-11T17:00:00"),
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-11T17:05:00"),
          metadata: {},
        }),
      ],
    });
    const header = buildAttendanceMatrixCsv([a, b], [])
      .split("\r\n")[1];
    expect(header).toBe(
      `Name,Email,${ATTENDANCE_PCT_HEADER},Weekly (04.03.2026),Weekly (11.03.2026)`
    );
  });

  test("zero-attendance events stay as columns but don't drag attendance % down", () => {
    const empty = baseEvent({
      _id: "empty",
      name: "Empty Night",
      attendanceCount: 0,
      rows: [],
    });
    const withPeople = eventA();
    const lines = buildAttendanceMatrixCsv(
      [empty, withPeople],
      []
    ).split("\r\n");
    expect(lines[0]).toBe("Total Attendance,,,0,2");
    expect(lines[1]).toBe(
      `Name,Email,${ATTENDANCE_PCT_HEADER},Empty Night,Week 1`
    );
    // Empty Night is excluded from the denominator (like the reference sheet),
    // so Ada who only attended Week 1 still reads 100%.
    expect(lines[2]).toBe("Ada Lovelace,ada@sow.org.au,100%,,Y");
  });

  test("a metadata field named Attendance % does not duplicate the % column", () => {
    const lines = buildAttendanceMatrixCsv(
      [eventA()],
      ["Gender", ATTENDANCE_PCT_HEADER]
    ).split("\r\n");
    expect(lines[1]).toBe(
      `Name,Email,Gender,${ATTENDANCE_PCT_HEADER},Week 1`
    );
    // Gender value only once; no second Attendance % metadata column.
    expect(lines[2]).toBe("Ada Lovelace,ada@sow.org.au,Female,100%,Y");
  });

  test("same event name on the same day gets an occurrence suffix", () => {
    const a = baseEvent({
      _id: "a",
      name: "Weekly",
      dateStart: at("2026-03-04T17:00:00"),
      attendanceCount: 1,
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: {},
        }),
      ],
    });
    const b = baseEvent({
      _id: "b",
      name: "Weekly",
      dateStart: at("2026-03-04T19:00:00"),
      attendanceCount: 1,
      rows: [
        exportRow({
          name: "Ada Lovelace",
          email: "ada@sow.org.au",
          signInTime: at("2026-03-04T19:05:00"),
          metadata: {},
        }),
      ],
    });
    const header = buildAttendanceMatrixCsv([a, b], []).split("\r\n")[1];
    expect(header).toBe(
      `Name,Email,${ATTENDANCE_PCT_HEADER},Weekly (04.03.2026),Weekly (04.03.2026) #2`
    );
  });

  test("people with the same display name stay as separate rows", () => {
    // Two distinct members both named "John Smith" (no email) — different
    // identityKeys so they must never collapse into one matrix row.
    const week1 = baseEvent({
      _id: "w1",
      name: "Week 1",
      attendanceCount: 2,
      rows: [
        exportRow({
          name: "John Smith",
          email: "",
          signInTime: at("2026-03-04T17:00:00"),
          memberId: "member-a",
          metadata: { Gender: "Male" },
        }),
        exportRow({
          name: "John Smith",
          email: "",
          signInTime: at("2026-03-04T17:05:00"),
          memberId: "member-b",
          metadata: { Gender: "Male" },
        }),
      ],
    });
    const week2 = baseEvent({
      _id: "w2",
      name: "Week 2",
      attendanceCount: 1,
      rows: [
        // Only member-a returns — must not merge with member-b just because
        // the display name matches.
        exportRow({
          name: "John Smith",
          email: "",
          signInTime: at("2026-03-11T17:00:00"),
          memberId: "member-a",
          metadata: { Gender: "Male" },
        }),
      ],
    });
    const lines = buildAttendanceMatrixCsv(
      [week1, week2],
      ["Gender"]
    ).split("\r\n");
    expect(lines[0]).toBe("Total Attendance,,,,2,1");
    // Two John Smith rows: one at 100% (both weeks), one at 50% (week 1 only).
    expect(lines).toHaveLength(4);
    const body = lines.slice(2);
    expect(body).toContain("John Smith,,Male,100%,Y,Y");
    expect(body).toContain("John Smith,,Male,50%,Y,");
  });

  test("unlinked same-name guests never merge across or within events", () => {
    const night = baseEvent({
      _id: "n",
      name: "Open Night",
      attendanceCount: 2,
      rows: [
        exportRow({
          name: "Unknown",
          email: "",
          signInTime: at("2026-03-04T17:00:00"),
          attendanceId: "att-1",
          metadata: {},
        }),
        exportRow({
          name: "Unknown",
          email: "",
          signInTime: at("2026-03-04T17:10:00"),
          attendanceId: "att-2",
          metadata: {},
        }),
      ],
    });
    const lines = buildAttendanceMatrixCsv([night], []).split("\r\n");
    expect(lines[0]).toBe("Total Attendance,,,2");
    // Two body rows, so Y marks sum to the Total Attendance headcount.
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe("Unknown,,100%,Y");
    expect(lines[3]).toBe("Unknown,,100%,Y");
  });

  test("rows missing identityKey with the same sign-in time stay separate", () => {
    // Legacy/incomplete fixtures with no identityKey and identical timestamps
    // must not collapse — the anon fallback uses event id + row index.
    const sameMs = at("2026-03-04T17:00:00");
    const night = baseEvent({
      _id: "n",
      name: "Open Night",
      attendanceCount: 2,
      rows: [
        {
          name: "Guest A",
          email: "",
          signInTime: sameMs,
          metadata: {},
          identityKey: "",
        },
        {
          name: "Guest B",
          email: "",
          signInTime: sameMs,
          metadata: {},
          identityKey: "",
        },
      ],
    });
    const lines = buildAttendanceMatrixCsv([night], []).split("\r\n");
    expect(lines[0]).toBe("Total Attendance,,,2");
    expect(lines).toHaveLength(4);
    expect(lines[2]).toBe("Guest A,,100%,Y");
    expect(lines[3]).toBe("Guest B,,100%,Y");
  });

  test("defangs formula-injection in names and event titles", () => {
    const event = baseEvent({
      _id: "x",
      name: "=cmd|calc",
      attendanceCount: 1,
      rows: [
        exportRow({
          name: "=HYPERLINK",
          email: "x@sow.org.au",
          signInTime: at("2026-03-04T17:05:00"),
          metadata: {},
        }),
      ],
    });
    const lines = buildAttendanceMatrixCsv([event], []).split("\r\n");
    expect(lines[1]).toContain("'=cmd|calc");
    expect(lines[2].startsWith("'=HYPERLINK,")).toBe(true);
  });
});

describe("exportSlug", () => {
  test("slugifies labels and falls back when empty", () => {
    expect(exportSlug("University of Sydney")).toBe("University-of-Sydney");
    expect(exportSlug("SOW")).toBe("SOW");
    expect(exportSlug("***")).toBe("export");
  });
});
