/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate, sydneyCalendarYear } from "../shared/flow";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const CAL_YEAR = sydneyCalendarYear(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";

const USYD = "University of Sydney";
const MACQ = "Macquarie University";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: MACQ });
  await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Missions",
    division: "Ministry",
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: STAFF,
    year: YEAR,
    roles: ["Staff"],
    department: "Missions",
  });
  const leader = asUser(t, LEADER);
  await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
  return { t, leader };
}

const window = (offsetDays = 0) => {
  const dateStart = Date.now() - offsetDays * DAY;
  return { dateStart, dateEnd: dateStart + 2 * 60 * 60 * 1000 };
};

describe("attendanceExport", () => {
  test("returns null when not signed in", async () => {
    const { t } = await setup();
    expect(
      await t.query(api.attendanceExport.eventsForExport, { subgroup: USYD })
    ).toBeNull();
  });

  test("exports events for a sub-group with resolved staff + member metadata", async () => {
    const { leader } = await setup();
    const eventId = await leader.mutation(api.events.create, {
      name: "Weekly Meeting",
      ...window(),
      subgroups: [USYD],
    });

    await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });

    const yearField = (
      await leader.query(api.attendanceMetadata.list, { })
    ).find((f) => f.key === "Year")!;
    const guestId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest Member",
      email: "guest@example.com",
      metadata: { [yearField._id]: String(CAL_YEAR - 2) },
    });
    await leader.mutation(api.attendance.signIn, {
      eventId,
      memberId: guestId,
    });

    const unknownYearId = await leader.mutation(api.attendanceMembers.create, {
      name: "Unknown Year",
      metadata: { [yearField._id]: "9999" },
    });
    await leader.mutation(api.attendance.signIn, {
      eventId,
      memberId: unknownYearId,
    });

    const data = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
    });
    expect(data).not.toBeNull();
    expect(data!.events).toHaveLength(1);
    const event = data!.events[0];
    expect(event.name).toBe("Weekly Meeting");
    expect(event.attendanceCount).toBe(3);
    expect(event.collaborative).toBe(false);

    const staffRow = event.rows.find((r) => r.email === LEADER)!;
    expect(staffRow.metadata.Campus).toBe(USYD);
    expect(staffRow.metadata.Role).toBe("Student Leader");

    const guestRow = event.rows.find((r) => r.name === "Guest Member")!;
    expect(guestRow.email).toBe("guest@example.com");
    expect(guestRow.metadata.Year).toBe("3");

    const unknownRow = event.rows.find((r) => r.name === "Unknown Year")!;
    expect(unknownRow.metadata.Year).toBeUndefined();
  });

  test("a member whose email is a staff profile is exported as that staff member", async () => {
    const { leader } = await setup();
    const eventId = await leader.mutation(api.events.create, {
      name: "Mixed",
      ...window(),
      subgroups: [USYD],
    });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Shadow Of Staff",
      email: STAFF,
    });
    await leader.mutation(api.attendance.signIn, { eventId, memberId });

    const data = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
    });
    const row = data!.events[0].rows[0];
    expect(row.email).toBe(STAFF);
  });

  test("filters by date range and by tags, and counts collaborative events", async () => {
    const { leader } = await setup();
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Weekly" }, { name: "Camp" }],
      deleteIds: [],
    });
    const tags = await leader.query(api.attendanceTags.list, {});
    const weekly = tags.find((t) => t.name === "Weekly")!._id;

    const recent = await leader.mutation(api.events.create, {
      name: "Recent Tagged",
      ...window(0),
      subgroups: [USYD],
      tagIds: [weekly],
    });
    await leader.mutation(api.attendance.signIn, {
      eventId: recent,
      email: LEADER,
    });
    const old = await leader.mutation(api.events.create, {
      name: "Old Untagged",
      ...window(10),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId: old, email: STAFF });
    await leader.mutation(api.events.create, {
      name: "Collab",
      ...window(1),
      subgroups: [USYD, MACQ],
    });

    const all = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
    });
    expect(all!.events.map((e) => e.name).sort()).toEqual([
      "Collab",
      "Old Untagged",
      "Recent Tagged",
    ]);
    const collab = all!.events.find((e) => e.name === "Collab")!;
    expect(collab.collaborative).toBe(true);
    expect(collab.collaborators).toEqual([MACQ]);

    const ranged = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
      dateStart: Date.now() - 3 * DAY,
      dateEnd: Date.now() + DAY,
    });
    expect(ranged!.events.map((e) => e.name).sort()).toEqual([
      "Collab",
      "Recent Tagged",
    ]);

    const fromOnly = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
      dateStart: Date.now() - 3 * DAY,
    });
    expect(fromOnly!.events.map((e) => e.name).sort()).toEqual([
      "Collab",
      "Recent Tagged",
    ]);
    const toOnly = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
      dateEnd: Date.now() - 5 * DAY,
    });
    expect(toOnly!.events.map((e) => e.name)).toEqual(["Old Untagged"]);

    const tagged = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
      tagIds: [weekly],
    });
    expect(tagged!.events.map((e) => e.name)).toEqual(["Recent Tagged"]);
    expect(tagged!.events[0].tags).toEqual(["Weekly"]);

    const fromMacq = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: MACQ,
    });
    expect(fromMacq!.events.map((e) => e.name)).toEqual(["Collab"]);
  });

  test("only exports metadata fields the sub-group can see", async () => {
    const { leader } = await setup();
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          key: "House",
          type: "select",
          order: 10,
          values: { "1": "Red" },
          subgroup: USYD,
        },
      ],
      deleteIds: [],
    });
    const house = (
      await leader.query(api.attendanceMetadata.list, {
        subgroup: USYD,
      })
    ).find((f) => f.key === "House")!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Houseful",
      metadata: { [house._id]: "1" },
    });

    const usydEvent = await leader.mutation(api.events.create, {
      name: "USYD Night",
      ...window(),
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, {
      eventId: usydEvent,
      memberId,
    });
    const macqEvent = await leader.mutation(api.events.create, {
      name: "MACQ Night",
      ...window(),
      subgroups: [MACQ],
    });
    await leader.mutation(api.attendance.signIn, {
      eventId: macqEvent,
      memberId,
    });

    const usyd = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
    });
    expect(usyd!.events[0].rows[0].metadata.House).toBe("Red");

    const macq = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: MACQ,
    });
    expect(macq!.events[0].rows[0].metadata.House).toBeUndefined();
  });

  test("handles an attendance row with neither email nor member id", async () => {
    const { t, leader } = await setup();
    const eventId = await leader.mutation(api.events.create, {
      name: "Orphan",
      ...window(),
      subgroups: [USYD],
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", {
        eventId: eventId as Id<"events">,
        signInTime: Date.now(),
      });
    });
    const data = await leader.query(api.attendanceExport.eventsForExport, {
      subgroup: USYD,
    });
    expect(data!.events[0].rows[0].name).toBe("Unknown");
    expect(data!.events[0].rows[0].email).toBe("");
  });

  test("eventForExport: single event, missing event, and empty-subgroup fallback", async () => {
    const { t, leader } = await setup();
    const someEvent = await leader.mutation(api.events.create, {
      name: "Solo",
      ...window(),
      subgroups: [USYD],
    });
    expect(
      await t.query(api.attendanceExport.eventForExport, { eventId: someEvent })
    ).toBeNull();

    await leader.mutation(api.attendance.signIn, {
      eventId: someEvent,
      email: LEADER,
    });
    const single = await leader.query(api.attendanceExport.eventForExport, {
      eventId: someEvent,
    });
    expect(single!.subgroup).toBe(USYD);
    expect(single!.event.name).toBe("Solo");
    expect(single!.event.rows).toHaveLength(1);

    const scoped = await leader.query(api.attendanceExport.eventForExport, {
      eventId: someEvent,
      subgroup: MACQ,
    });
    expect(scoped!.subgroup).toBe(MACQ);

    await leader.mutation(api.events.remove, { eventId: someEvent });
    expect(
      await leader.query(api.attendanceExport.eventForExport, {
        eventId: someEvent,
      })
    ).toBeNull();

    const emptyId = await t.run(async (ctx) =>
      ctx.db.insert("events", {
        name: "No Subgroups",
        dateStart: Date.now(),
        dateEnd: Date.now() + DAY,
        subgroups: [],
      })
    );
    const fallback = await leader.query(api.attendanceExport.eventForExport, {
      eventId: emptyId,
    });
    expect(fallback!.subgroup).toBe("SOW");
    expect(fallback!.event.collaborative).toBe(false);
  });
});

describe("attendanceExport de-duplication", () => {
  test("a person signed in by both email and memberId exports as one row", async () => {
    const { leader } = await setup();
    const eventId = await leader.mutation(api.events.create, {
      name: "Weekly Meeting",
      ...window(),
      subgroups: [USYD],
    });
    const memberId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await leader.mutation(api.attendance.signIn, { eventId, email: LEADER });
    await leader.mutation(api.attendance.signIn, { eventId, memberId });

    const data = await leader.query(api.attendanceExport.eventForExport, {
      eventId,
      subgroup: USYD,
    });
    expect(data!.event.rows).toHaveLength(1);
    expect(data!.event.rows[0].email).toBe(LEADER);
    expect(data!.event.attendanceCount).toBe(1);
  });

  test("merging two rows for one person keeps the earliest sign-in", async () => {
    const { t, leader } = await setup();
    const eventId = await leader.mutation(api.events.create, {
      name: "Weekly Meeting",
      ...window(),
      subgroups: [USYD],
    });
    const memberId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("attendance", {
        eventId,
        email: LEADER,
        signInTime: 2000,
      });
      await ctx.db.insert("attendance", { eventId, memberId, signInTime: 1000 });
    });

    const data = await leader.query(api.attendanceExport.eventForExport, {
      eventId,
      subgroup: USYD,
    });
    expect(data!.event.rows).toHaveLength(1);
    expect(data!.event.rows[0].email).toBe(LEADER);
    expect(data!.event.rows[0].signInTime).toBe(1000);
  });
});
