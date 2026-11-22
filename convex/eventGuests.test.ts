import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { buildAttendanceCsv, buildAttendanceMatrixCsv } from "../src/lib/attendanceCsv";
import { EVENT_GUEST_NAME_MAX } from "../shared/eventGuests";
import {
  type T,
  ADMIN,
  DAY,
  HOUR,
  MINUTE,
  OUTSIDER,
  USYD,
  YEAR,
  asUser,
  createEvent,
  pinClock,
  seeded,
} from "../test/convexFixture";

pinClock();

async function setup() {
  const t = await seeded();
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  const admin = asUser(t, ADMIN);
  const eventId = await createEvent(admin, { name: "Parents night" });
  const ann = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann" }));
  return { t, admin, eventId, ann };
}

const storedCount = (t: T, eventId: Id<"events">) =>
  t.run(
    async (ctx) =>
      (
        await ctx.db
          .query("eventAttendanceCounts")
          .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
          .unique()
      )?.count ?? null
  );

const listedCount = async (t: T, eventId: Id<"events">) => {
  const list = await asUser(t, ADMIN).query(api.events.listBySubgroup, { subgroup: USYD });
  return list.events.find((e) => e._id === eventId)?.attendanceCount;
};

describe("event guests", () => {
  test("a guest counts toward the event but is never saved as a member", async () => {
    const { t, admin, eventId, ann } = await setup();
    const membersBefore = await t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await admin.mutation(api.eventGuests.add, { eventId, name: "  Ann's   Mum " });

    expect(await admin.query(api.eventGuests.listByEvent, { eventId })).toEqual([
      expect.objectContaining({ name: "Ann's Mum" }),
    ]);
    expect(await storedCount(t, eventId)).toBe(2);
    expect(await listedCount(t, eventId)).toBe(2);

    expect(await t.run((ctx) => ctx.db.query("attendanceMembers").collect())).toEqual(membersBefore);
    const signedIn = await admin.query(api.attendance.listByEvent, { eventId });
    expect(signedIn.map((row) => row.name)).toEqual(["Ann"]);
    const other = await createEvent(admin, { name: "Next week", dateStart: Date.now() + DAY });
    const found = await admin.query(api.attendance.searchRoster, { eventId: other, search: "Mum" });
    expect(found).toEqual([]);
  });

  test("removing a guest lowers the count", async () => {
    const { t, admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    expect(await storedCount(t, eventId)).toBe(1);
    await admin.mutation(api.eventGuests.remove, { guestId });
    expect(await admin.query(api.eventGuests.listByEvent, { eventId })).toEqual([]);
    expect(await storedCount(t, eventId)).toBe(0);
    // Removing it again does nothing.
    await admin.mutation(api.eventGuests.remove, { guestId });
    expect(await storedCount(t, eventId)).toBe(0);
  });

  test("adding and removing a guest is logged against the event", async () => {
    const { t, admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    await admin.mutation(api.eventGuests.remove, { guestId });
    const actions = await t.run(async (ctx) =>
      (
        await ctx.db
          .query("attendanceAuditLog")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect()
      ).map((row) => [row.action, row.summary, row.memberId ?? null])
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        ["attendance.guestAdd", expect.stringContaining("Dad (guest) signed in"), null],
        ["attendance.guestRemove", expect.stringContaining("Removed Dad (guest)"), null],
      ])
    );
  });

  test("renaming a guest fixes the name without changing the count", async () => {
    const { t, admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dadd" });
    await admin.mutation(api.eventGuests.rename, { guestId, name: "  Ann's   Dad " });
    expect(await admin.query(api.eventGuests.listByEvent, { eventId })).toEqual([
      expect.objectContaining({ _id: guestId, name: "Ann's Dad" }),
    ]);
    expect(await storedCount(t, eventId)).toBe(1);
    const renames = async () =>
      (await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect()))
        .filter((row) => row.action === "attendance.guestRename")
        .map((row) => [row.summary, row.eventId]);
    expect(await renames()).toEqual([
      [expect.stringContaining("Renamed Dadd (guest) to Ann's Dad"), eventId],
    ]);
    // The same name again changes nothing and logs nothing.
    await admin.mutation(api.eventGuests.rename, { guestId, name: "Ann's Dad" });
    expect(await renames()).toHaveLength(1);
  });

  test("a renamed guest needs a name of a sensible length", async () => {
    const { admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    await expect(admin.mutation(api.eventGuests.rename, { guestId, name: "  " })).rejects.toThrow(
      /name is required/
    );
    await expect(
      admin.mutation(api.eventGuests.rename, { guestId, name: "x".repeat(EVENT_GUEST_NAME_MAX + 1) })
    ).rejects.toThrow(/under/);
    expect((await admin.query(api.eventGuests.listByEvent, { eventId })).map((g) => g.name)).toEqual([
      "Dad",
    ]);
  });

  test("a removed guest can't be renamed", async () => {
    const { admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    await admin.mutation(api.eventGuests.remove, { guestId });
    await expect(admin.mutation(api.eventGuests.rename, { guestId, name: "Mum" })).rejects.toThrow(
      /has been removed/
    );
  });

  test("a guest can be renamed after the event ends", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin, {
      dateStart: Date.now() - 3 * HOUR,
      dateEnd: Date.now() - 2 * HOUR,
    });
    const guestId = await t.run((ctx) =>
      ctx.db.insert("eventGuests", { eventId, name: "Early", addedAt: Date.now() - 2.5 * HOUR, addedBy: ADMIN })
    );
    await admin.mutation(api.eventGuests.rename, { guestId, name: "Earlier" });
    expect((await admin.query(api.eventGuests.listByEvent, { eventId })).map((g) => g.name)).toEqual([
      "Earlier",
    ]);
  });

  test("a guest needs a name of a sensible length", async () => {
    const { admin, eventId } = await setup();
    await expect(admin.mutation(api.eventGuests.add, { eventId, name: "   " })).rejects.toThrow(
      /name is required/
    );
    await expect(
      admin.mutation(api.eventGuests.add, { eventId, name: "x".repeat(EVENT_GUEST_NAME_MAX + 1) })
    ).rejects.toThrow(/under/);
  });

  test("an event holds at most 500 guests", async () => {
    const { t, admin, eventId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 500; i++) {
        await ctx.db.insert("eventGuests", { eventId, name: `Guest ${i}`, addedAt: Date.now(), addedBy: ADMIN });
      }
    });
    await expect(admin.mutation(api.eventGuests.add, { eventId, name: "One more" })).rejects.toThrow(
      /as many guests/
    );
  });

  test("a guest can't be added to a missing event", async () => {
    const { t, admin, eventId } = await setup();
    await t.run((ctx) => ctx.db.delete("events", eventId));
    await expect(admin.mutation(api.eventGuests.add, { eventId, name: "Dad" })).rejects.toThrow(
      /Event not found/
    );
  });

  test("only people with a profile see or change guests", async () => {
    const { t, admin, eventId } = await setup();
    const guestId = await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    const outsider = asUser(t, OUTSIDER);
    expect(await outsider.query(api.eventGuests.listByEvent, { eventId })).toEqual([]);
    expect(await t.query(api.eventGuests.listByEvent, { eventId })).toEqual([]);
    await expect(outsider.mutation(api.eventGuests.add, { eventId, name: "Mum" })).rejects.toThrow();
    await expect(outsider.mutation(api.eventGuests.remove, { guestId })).rejects.toThrow();
    await expect(outsider.mutation(api.eventGuests.rename, { guestId, name: "Mum" })).rejects.toThrow();
    expect(await admin.query(api.eventGuests.listByEvent, { eventId: "not-an-id" })).toEqual([]);
  });

  test("after an event ends, a guest stays unless added in the last 10 minutes", async () => {
    const { t, admin } = await setup();
    const eventId = await createEvent(admin, {
      dateStart: Date.now() - 3 * HOUR,
      dateEnd: Date.now() - 2 * HOUR,
    });
    const early = await t.run((ctx) =>
      ctx.db.insert("eventGuests", {
        eventId,
        name: "Early",
        addedAt: Date.now() - 2.5 * HOUR,
        addedBy: ADMIN,
      })
    );
    await expect(admin.mutation(api.eventGuests.remove, { guestId: early })).rejects.toThrow(
      /can't be removed/
    );
    const late = await admin.mutation(api.eventGuests.add, { eventId, name: "Late" });
    await admin.mutation(api.eventGuests.remove, { guestId: late });
    expect((await admin.query(api.eventGuests.listByEvent, { eventId })).map((g) => g.name)).toEqual([
      "Early",
    ]);
  });

  test("guests are listed newest first", async () => {
    const { t, admin, eventId } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("eventGuests", { eventId, name: "First", addedAt: Date.now() - 5 * MINUTE, addedBy: ADMIN });
      await ctx.db.insert("eventGuests", { eventId, name: "Second", addedAt: Date.now(), addedBy: ADMIN });
    });
    expect((await admin.query(api.eventGuests.listByEvent, { eventId })).map((g) => g.name)).toEqual([
      "Second",
      "First",
    ]);
  });

  test("a recount includes guests", async () => {
    const { t, admin, eventId, ann } = await setup();
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("eventAttendanceCounts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique();
      if (row) await ctx.db.delete("eventAttendanceCounts", row._id);
    });
    expect(await listedCount(t, eventId)).toBe(2);
    await t.run(async (ctx) => {
      const { recountEventAttendance } = await import("./attendanceCounts");
      await recountEventAttendance(ctx, eventId);
    });
    expect(await storedCount(t, eventId)).toBe(2);
  });

  test("deleting an event deletes its guests and says so", async () => {
    const { t, admin, eventId, ann } = await setup();
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    const preview = await admin.query(api.events.deletePreview, { eventId });
    expect(preview?.total).toBe(2);
    expect(preview?.people.map((p) => p.name)).toEqual(["Ann", "Dad (guest)"]);

    await admin.mutation(api.events.remove, { eventId });
    expect(await t.run((ctx) => ctx.db.query("eventGuests").collect())).toEqual([]);
    const log = await t.run(async (ctx) =>
      (await ctx.db.query("attendanceAuditLog").collect()).find((row) => row.action === "event.delete")
    );
    expect(log?.detail).toContain("Removed 1 guest: Dad");
  });

  test("the delete preview counts every guest but lists at most 100 people", async () => {
    const { t, admin, eventId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("eventGuests", { eventId, name: `Guest ${i}`, addedAt: Date.now(), addedBy: ADMIN });
      }
    });
    const preview = await admin.query(api.events.deletePreview, { eventId });
    expect(preview?.total).toBe(101);
    expect(preview?.people).toHaveLength(100);
  });

  test("deleting an event with only guests lists just the guests", async () => {
    const { t, admin, eventId } = await setup();
    await admin.mutation(api.eventGuests.add, { eventId, name: "Mum" });
    await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    await admin.mutation(api.events.remove, { eventId });
    const log = await t.run(async (ctx) =>
      (await ctx.db.query("attendanceAuditLog").collect()).find((row) => row.action === "event.delete")
    );
    expect(log?.detail).toMatch(/^Removed 2 guests: /);
  });

  test("exports count guests and list them under the event, but not as people", async () => {
    const { t, admin, eventId, ann } = await setup();
    await admin.mutation(api.attendance.signIn, { eventId, memberId: ann });
    await t.run((ctx) =>
      ctx.db.insert("eventGuests", { eventId, name: "Mum", addedAt: Date.now() - MINUTE, addedBy: ADMIN })
    );
    await admin.mutation(api.eventGuests.add, { eventId, name: "Dad" });
    const exported = await admin.query(api.attendanceExport.eventForExport, { eventId, subgroup: USYD });
    const event = exported!.event;
    expect(event.attendanceCount).toBe(3);
    expect(event.guests?.map((g) => g.name)).toEqual(["Dad", "Mum"]);

    const csv = buildAttendanceCsv([event], ["Event notes"]);
    expect(csv).toContain("Dad (guest)");
    const matrix = buildAttendanceMatrixCsv([event], []);
    expect(matrix).not.toContain("Dad");
    expect(matrix.split("\r\n")[0]).toMatch(/,3$/);
  });
});
