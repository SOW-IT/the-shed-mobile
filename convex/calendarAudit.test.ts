import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api } from "./_generated/api";
import { type T, ADMIN, DAY, STAFF, USYD, asUser, seeded } from "../test/convexFixture";

const NOW = staffYearStartMs(staffYearForDate(new Date())) + 120 * DAY;
const YEAR = staffYearForDate(new Date(NOW));
const HOUR = 3_600_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = await seeded();
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
    year: YEAR,
    email: STAFF,
    roles: ["Staff"],
    department: "Marketing",
  });
  return t;
}

const entry = (over: Record<string, unknown> = {}) => ({
  name: "Marketing meeting",
  dateStart: NOW + 3 * DAY,
  dateEnd: NOW + 3 * DAY + 2 * HOUR,
  ...over,
});

const history = async (t: T, email = ADMIN) =>
  (await asUser(t, email).query(api.calendarAudit.list, { paginationOpts: { numItems: 20, cursor: null } }))!
    .page;

describe("calendar audit log", () => {
  test("records who added, edited and deleted an entry, and what an edit changed", async () => {
    const t = await setup();
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    await asUser(t, STAFF).mutation(api.calendar.updateEntry, { id, ...entry() });
    await asUser(t, ADMIN).mutation(api.calendar.updateEntry, {
      id,
      ...entry({ name: "Marketing sync", dateStart: NOW + 4 * DAY, dateEnd: NOW + 4 * DAY + HOUR }),
    });
    await asUser(t, ADMIN).mutation(api.calendar.removeEntry, { id });

    const rows = await history(t);
    expect(rows.map((row) => [row.action, row.name, row.actorEmail])).toEqual([
      ["removed", "Marketing sync", ADMIN],
      ["edited", "Marketing sync", ADMIN],
      ["added", "Marketing meeting", STAFF],
    ]);
    expect(rows[1].changes.map((change) => change.field)).toEqual(["Name", "When"]);
    expect(rows[1].changes[0]).toEqual({ field: "Name", from: "Marketing meeting", to: "Marketing sync" });
    expect(rows[2]).toMatchObject({ changes: [], eventId: null });
    expect(rows[2].when).toMatch(/ to /);
  });

  test("records an entry turned into an attendance event, with a link to the event", async () => {
    const t = await setup();
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    const eventId = await asUser(t, STAFF).mutation(api.events.create, {
      name: "Marketing meeting",
      subgroups: [USYD],
      dateStart: NOW + 3 * DAY,
      dateEnd: NOW + 5 * DAY,
      replacesEntryId: id,
    });
    const [row] = await history(t);
    expect(row).toMatchObject({ action: "attendance", name: "Marketing meeting", eventId });
  });

  test("only admins can read it", async () => {
    const t = await setup();
    await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    expect(await asUser(t, STAFF).query(api.calendarAudit.list, { paginationOpts: { numItems: 5, cursor: null } }))
      .toBeNull();
    expect(await t.query(api.calendarAudit.list, { paginationOpts: { numItems: 5, cursor: null } })).toBeNull();
    expect(await history(t)).toHaveLength(1);
  });
});
