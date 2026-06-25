/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const STAFF = "staff@sow.org.au"; // department staff who performs actions
const OTHER = "other@sow.org.au"; // a second staff member, separate actor

const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const window = () => ({ dateStart: Date.now(), dateEnd: Date.now() + 3600_000 });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Missions",
    division: "Ministry",
  });
  for (const email of [STAFF, OTHER]) {
    await admin.mutation(api.admin.setStaffProfile, {
      email,
      year: YEAR,
      roles: ["Staff"],
      department: "Missions",
    });
  }
  return t;
}

const allLogs = (t: TestConvex<typeof schema>) =>
  t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());

describe("attendance audit logging", () => {
  test("creating an event writes one audit row with actor + action + eventId", async () => {
    const t = await setup();
    const { dateStart, dateEnd } = window();
    const eventId = await asUser(t, STAFF).mutation(api.events.create, {
      name: "Weekly Meeting",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });

    const logs = await allLogs(t);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      actorEmail: STAFF,
      entityType: "event",
      action: "event.create",
      eventId,
    });
    expect(logs[0].summary).toContain("Weekly Meeting");
  });

  test("sign-in logs once and is idempotent on repeat", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const memberId = await staff.mutation(api.attendanceMembers.create, {
      name: "Sam Member",
    });

    await staff.mutation(api.attendance.signIn, { eventId, memberId });
    await staff.mutation(api.attendance.signIn, { eventId, memberId }); // no-op

    const signInLogs = (await allLogs(t)).filter(
      (l) => l.action === "attendance.signIn"
    );
    expect(signInLogs).toHaveLength(1);
    expect(signInLogs[0].summary).toContain("Sam Member");
    expect(signInLogs[0].eventId).toBe(eventId);
  });

  test("sign-out logs only when a record actually existed", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const memberId = await staff.mutation(api.attendanceMembers.create, {
      name: "Sam Member",
    });

    // Sign out before sign-in: nothing to remove, so nothing logged.
    await staff.mutation(api.attendance.signOut, { eventId, memberId });
    expect(
      (await allLogs(t)).filter((l) => l.action === "attendance.signOut")
    ).toHaveLength(0);

    await staff.mutation(api.attendance.signIn, { eventId, memberId });
    await staff.mutation(api.attendance.signOut, { eventId, memberId });
    expect(
      (await allLogs(t)).filter((l) => l.action === "attendance.signOut")
    ).toHaveLength(1);
  });

  test("list filters by event and by actor, and search matches the summary", async () => {
    const t = await setup();
    const { dateStart, dateEnd } = window();
    const eventA = await asUser(t, STAFF).mutation(api.events.create, {
      name: "Alpha Camp",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const eventB = await asUser(t, OTHER).mutation(api.events.create, {
      name: "Beta Retreat",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });

    const viewer = asUser(t, ADMIN);
    const opts = { numItems: 50, cursor: null };

    const byEvent = await viewer.query(api.attendanceAudit.list, {
      eventId: eventA,
      paginationOpts: opts,
    });
    expect(byEvent.page).toHaveLength(1);
    expect(byEvent.page[0].eventId).toBe(eventA);

    const byActor = await viewer.query(api.attendanceAudit.list, {
      actorEmail: OTHER,
      paginationOpts: opts,
    });
    expect(byActor.page).toHaveLength(1);
    expect(byActor.page[0].actorEmail).toBe(OTHER);
    expect(byActor.page[0].eventId).toBe(eventB);

    const bySearch = await viewer.query(api.attendanceAudit.list, {
      search: "Beta",
      paginationOpts: opts,
    });
    expect(bySearch.page).toHaveLength(1);
    expect(bySearch.page[0].summary).toContain("Beta");
  });

  test("list is gated to signed-in staff", async () => {
    const t = await setup();
    const anon = await t.query(api.attendanceAudit.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(anon.page).toEqual([]);
    expect(anon.isDone).toBe(true);
  });
});
