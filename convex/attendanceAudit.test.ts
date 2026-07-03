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

    const byMultipleEventsAndActors = await viewer.query(api.attendanceAudit.list, {
      eventIds: [eventA, eventB],
      actorEmails: [STAFF, OTHER],
      paginationOpts: opts,
    });
    expect(byMultipleEventsAndActors.page.map((r) => r.eventId)).toEqual(
      expect.arrayContaining([eventA, eventB])
    );
    expect(byMultipleEventsAndActors.page).toHaveLength(2);

    const bySearch = await viewer.query(api.attendanceAudit.list, {
      search: "Beta",
      paginationOpts: opts,
    });
    expect(bySearch.page).toHaveLength(1);
    expect(bySearch.page[0].summary).toContain("Beta");

    // Event + actor combine: eventA was created by STAFF, so filtering it by a
    // different actor must return nothing (not every row for the event).
    const eventPlusOtherActor = await viewer.query(api.attendanceAudit.list, {
      eventId: eventA,
      actorEmail: OTHER,
      paginationOpts: opts,
    });
    expect(eventPlusOtherActor.page).toHaveLength(0);

    const eventPlusRightActor = await viewer.query(api.attendanceAudit.list, {
      eventId: eventA,
      actorEmail: STAFF,
      paginationOpts: opts,
    });
    expect(eventPlusRightActor.page).toHaveLength(1);
  });

  test("list filters by entity type", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    await staff.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await staff.mutation(api.attendanceMembers.create, { name: "A Member" });

    const opts = { numItems: 50, cursor: null };
    const members = await staff.query(api.attendanceAudit.list, {
      entityType: "member",
      paginationOpts: opts,
    });
    expect(members.page).toHaveLength(1);
    expect(members.page.every((r) => r.entityType === "member")).toBe(true);

    const events = await staff.query(api.attendanceAudit.list, {
      entityType: "event",
      paginationOpts: opts,
    });
    expect(events.page).toHaveLength(1);
    expect(events.page[0].entityType).toBe("event");

    const multipleTypes = await staff.query(api.attendanceAudit.list, {
      entityTypes: ["event", "member"],
      paginationOpts: opts,
    });
    expect(multipleTypes.page.map((r) => r.entityType)).toEqual(
      expect.arrayContaining(["event", "member"])
    );
    expect(multipleTypes.page).toHaveLength(2);
  });

  test("search paginates across pages", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    for (const n of [1, 2, 3]) {
      await staff.mutation(api.events.create, {
        name: `Sprint Camp ${n}`,
        dateStart,
        dateEnd,
        subgroups: [USYD],
      });
    }

    const first = await staff.query(api.attendanceAudit.list, {
      search: "Sprint",
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).not.toBe("");

    const second = await staff.query(api.attendanceAudit.list, {
      search: "Sprint",
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);
  });

  test("a sparse filter scans several internal pages in one call", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    // One matching row (oldest), then many non-matching ones. A newest-first scan
    // must page past all the fillers before it finds the single match, so filling
    // `numItems` matches needs several underlying pages in ONE list() call. The
    // old built-in `.paginate()`-in-a-loop threw "ran multiple paginated queries"
    // and crashed the Audit tab here; `paginator` walks the pages fine.
    await staff.mutation(api.events.create, {
      name: "Unicorn Gala",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    for (let i = 0; i < 8; i++) {
      await staff.mutation(api.events.create, {
        name: `Filler ${i}`,
        dateStart: dateStart + i + 1,
        dateEnd,
        subgroups: [USYD],
      });
    }

    const res = await staff.query(api.attendanceAudit.list, {
      search: "Unicorn",
      paginationOpts: { numItems: 3, cursor: null },
    });
    expect(res.page).toHaveLength(1);
    expect(res.page[0].summary).toContain("Unicorn");
    expect(res.isDone).toBe(true);
  });

  test("filterOptions lists distinct actors and recent events, dropping deleted ones", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const liveEvent = await staff.mutation(api.events.create, {
      name: "Live Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    // A second live event so filterOptions has >1 event to sort by date.
    const laterEvent = await staff.mutation(api.events.create, {
      name: "Later Event",
      dateStart: dateStart + 1000,
      dateEnd: dateEnd + 1000,
      subgroups: [USYD],
    });
    // An event referenced by a sign-in log, then deleted: its log row keeps the
    // eventId, but filterOptions must skip the now-missing event.
    const goneEvent = await asUser(t, OTHER).mutation(api.events.create, {
      name: "Gone Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const memberId = await staff.mutation(api.attendanceMembers.create, {
      name: "Sam",
    });
    await staff.mutation(api.attendance.signIn, {
      eventId: goneEvent,
      memberId,
    });
    await staff.mutation(api.events.remove, { eventId: goneEvent });

    const options = await staff.query(api.attendanceAudit.filterOptions, {});
    expect(options.actors.map((a) => a.email).sort()).toEqual(
      [OTHER, STAFF].sort()
    );
    const eventIds = options.events.map((e) => e.id);
    expect(eventIds).toContain(liveEvent);
    expect(eventIds).toContain(laterEvent);
    expect(eventIds).not.toContain(goneEvent);
    // Newest event first.
    expect(options.events[0].id).toBe(laterEvent);
  });

  test("filterOptions is gated to signed-in staff", async () => {
    const t = await setup();
    const anon = await t.query(api.attendanceAudit.filterOptions, {});
    expect(anon).toEqual({ actors: [], events: [] });
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

describe("audit logging across attendance mutations", () => {
  const actionsFor = async (t: TestConvex<typeof schema>) =>
    (await allLogs(t)).map((l) => l.action);

  test("event update logs real changes only; a no-op save logs nothing", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "Orig",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });

    // Real change → one logged update with a detail of what changed.
    await staff.mutation(api.events.update, {
      eventId,
      name: "Renamed",
      dateStart: dateStart + 1000,
      dateEnd: dateEnd + 1000,
      subgroups: [USYD, "SOW"],
      tagIds: [],
    });
    // No-op save (identical values) → nothing logged.
    await staff.mutation(api.events.update, {
      eventId,
      name: "Renamed",
      dateStart: dateStart + 1000,
      dateEnd: dateEnd + 1000,
      subgroups: [USYD, "SOW"],
      tagIds: [],
    });

    const updates = (await allLogs(t)).filter((l) => l.action === "event.update");
    expect(updates).toHaveLength(1);
    expect(updates[0].detail).toContain("name");
  });

  test("event delete notes removed attendance records only when present", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const empty = await staff.mutation(api.events.create, {
      name: "Empty",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const withPeople = await staff.mutation(api.events.create, {
      name: "Busy",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    const memberId = await staff.mutation(api.attendanceMembers.create, {
      name: "Sam",
    });
    await staff.mutation(api.attendance.signIn, {
      eventId: withPeople,
      memberId,
    });

    await staff.mutation(api.events.remove, { eventId: empty });
    await staff.mutation(api.events.remove, { eventId: withPeople });

    const deletes = (await allLogs(t)).filter((l) => l.action === "event.delete");
    expect(deletes).toHaveLength(2);
    expect(deletes.some((l) => l.detail?.includes("attendance record"))).toBe(
      true
    );
    expect(deletes.some((l) => !l.detail)).toBe(true);
  });

  test("member update and delete log for both plain and staff rows", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    // Plain member: update name, then delete (with a sign-in to exercise detail).
    const plain = await staff.mutation(api.attendanceMembers.create, {
      name: "Plain",
    });
    await staff.mutation(api.attendanceMembers.update, {
      memberId: plain,
      name: "Plain Renamed",
    });

    // Staff overlay: ensureForStaff creates it, then update goes the staff path.
    const overlay = await staff.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
      staffYear: YEAR,
    });
    await staff.mutation(api.attendanceMembers.update, {
      memberId: overlay,
      name: "ignored for staff",
      staffYear: YEAR,
    });

    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await staff.mutation(api.attendance.signIn, { eventId, memberId: plain });
    await staff.mutation(api.attendanceMembers.remove, { memberId: plain });

    const actions = await actionsFor(t);
    expect(actions.filter((a) => a === "member.update")).toHaveLength(2);
    expect(actions.filter((a) => a === "member.create").length).toBeGreaterThanOrEqual(
      2
    ); // plain + ensureForStaff overlay
    const del = (await allLogs(t)).find((l) => l.action === "member.delete");
    expect(del?.detail).toContain("attendance record");
  });

  test("ensureForStaff reuses an existing member row without a duplicate log", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    // A row already exists under the staff email — since members link by email,
    // ensureForStaff should reuse it (no insert, no spurious link log).
    const preexisting = await staff.mutation(api.attendanceMembers.create, {
      name: "Pre Existing",
      email: STAFF,
    });
    const reused = await staff.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
      staffYear: YEAR,
    });
    expect(reused).toBe(preexisting); // same row, no duplicate

    const logs = await allLogs(t);
    // Only the original create for this row — ensureForStaff added nothing.
    expect(
      logs.filter((l) => l.action === "member.create" && l.memberId === preexisting)
    ).toHaveLength(1);
    expect(logs.some((l) => l.summary.includes("Linked"))).toBe(false);
  });

  test("tags log create, rename, plain update and delete", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);

    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Weekly" }],
      deleteIds: [],
    });
    let tags = await staff.query(api.attendanceTags.list, { year: YEAR });
    const tagId = tags[0]._id;

    // Rename.
    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ id: tagId, name: "Weekly Meeting" }],
      deleteIds: [],
    });
    // Plain update (same name, different colour).
    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ id: tagId, name: "Weekly Meeting", colour: "#abcdef" }],
      deleteIds: [],
    });
    // Delete.
    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [],
      deleteIds: [tagId],
    });

    const actions = await actionsFor(t);
    expect(actions).toContain("tag.create");
    expect(actions).toContain("tag.update");
    expect(actions).toContain("tag.delete");
    const renamed = (await allLogs(t)).find(
      (l) => l.action === "tag.update" && l.summary.includes("→")
    );
    expect(renamed).toBeTruthy();
  });

  test("re-saving all tags logs an update only for the one that changed", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);
    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }],
      deleteIds: [],
    });
    const tags = await staff.query(api.attendanceTags.list, { year: YEAR });
    const idOf = (n: string) => tags.find((x) => x.name === n)!._id;

    // The client re-sends every tag on save; only Beta's colour changes here.
    await staff.mutation(api.attendanceTags.saveAll, {
      year: YEAR,
      tags: [
        { id: idOf("Alpha"), name: "Alpha" },
        { id: idOf("Beta"), name: "Beta", colour: "#abcdef" },
        { id: idOf("Gamma"), name: "Gamma" },
      ],
      deleteIds: [],
    });

    const updates = (await allLogs(t)).filter((l) => l.action === "tag.update");
    expect(updates).toHaveLength(1);
    expect(updates[0].summary).toContain("Beta");
  });

  test("member fields log create, rename, unchanged-skip and delete", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);

    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [{ key: "Cohort", type: "input", order: 50 }],
      deleteIds: [],
    });
    let fields = await staff.query(api.attendanceMetadata.list, {});
    const field = fields.find((f) => f.key === "Cohort")!;

    // Rename.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [{ id: field._id, key: "Group", type: "input", order: 50 }],
      deleteIds: [],
    });
    // Unchanged: should NOT log.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [{ id: field._id, key: "Group", type: "input", order: 50 }],
      deleteIds: [],
    });
    // Delete.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [],
      deleteIds: [field._id],
    });

    const meta = (await allLogs(t)).filter((l) => l.entityType === "metadata");
    expect(meta.filter((l) => l.action === "metadata.create")).toHaveLength(1);
    // Exactly one update (the rename); the unchanged save logs nothing.
    expect(meta.filter((l) => l.action === "metadata.update")).toHaveLength(1);
    expect(meta.filter((l) => l.action === "metadata.delete")).toHaveLength(1);
    expect(meta.find((l) => l.action === "metadata.update")?.summary).toContain(
      "→"
    );
  });

  test("swapping two member fields logs a swap, not generic updates", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { key: "Alpha", type: "input", order: 0 },
        { key: "Beta", type: "input", order: 1 },
      ],
      deleteIds: [],
    });
    const fields = await staff.query(api.attendanceMetadata.list, {});
    const alpha = fields.find((f) => f.key === "Alpha")!;
    const beta = fields.find((f) => f.key === "Beta")!;

    // Swap their positions only.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { id: alpha._id, key: "Alpha", type: "input", order: 1 },
        { id: beta._id, key: "Beta", type: "input", order: 0 },
      ],
      deleteIds: [],
    });

    const meta = (await allLogs(t)).filter((l) => l.entityType === "metadata");
    const reorders = meta.filter((l) => l.action === "metadata.reorder");
    expect(reorders).toHaveLength(1);
    expect(reorders[0].summary).toContain("Swapped order");
    expect(reorders[0].summary).toContain("Alpha");
    expect(reorders[0].summary).toContain("Beta");
    // The swap must not also emit generic "Updated member field" rows.
    expect(meta.filter((l) => l.action === "metadata.update")).toHaveLength(0);
  });

  test("reordering several member fields logs one reorder event", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { key: "One", type: "input", order: 0 },
        { key: "Two", type: "input", order: 1 },
        { key: "Three", type: "input", order: 2 },
      ],
      deleteIds: [],
    });
    const fields = await staff.query(api.attendanceMetadata.list, {});
    const id = (k: string) => fields.find((f) => f.key === k)!._id;

    // Rotate all three (not a clean two-field swap).
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { id: id("One"), key: "One", type: "input", order: 2 },
        { id: id("Two"), key: "Two", type: "input", order: 0 },
        { id: id("Three"), key: "Three", type: "input", order: 1 },
      ],
      deleteIds: [],
    });

    const reorders = (await allLogs(t)).filter(
      (l) => l.action === "metadata.reorder"
    );
    expect(reorders).toHaveLength(1);
    expect(reorders[0].summary).toContain("Reordered member fields");
    expect(reorders[0].summary).not.toContain("Swapped");
  });

  // UAT #1: adding a field re-indexes every field's order (client sends 0..N),
  // which shifted absolute orders and spammed a "Reordered…" entry for untouched
  // fields whose relative position never changed.
  test("adding a field over non-contiguous orders logs no spurious reorder", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);
    // Simulate accumulated non-contiguous orders (e.g. left by earlier deletes).
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { key: "Alpha", type: "input", order: 0 },
        { key: "Beta", type: "input", order: 5 },
        { key: "Gamma", type: "input", order: 10 },
      ],
      deleteIds: [],
    });
    const fields = await staff.query(api.attendanceMetadata.list, {});
    const id = (k: string) => fields.find((f) => f.key === k)!._id;
    // Client adds "Delta" and reindexes everyone to a contiguous 0..3 — same
    // relative order, so nothing was actually reordered.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        { id: id("Alpha"), key: "Alpha", type: "input", order: 0 },
        { id: id("Beta"), key: "Beta", type: "input", order: 1 },
        { id: id("Gamma"), key: "Gamma", type: "input", order: 2 },
        { key: "Delta", type: "input", order: 3 },
      ],
      deleteIds: [],
    });

    const meta = (await allLogs(t)).filter((l) => l.entityType === "metadata");
    expect(meta.filter((l) => l.action === "metadata.reorder")).toHaveLength(0);
    expect(meta.filter((l) => l.action === "metadata.update")).toHaveLength(0);
    expect(
      meta.filter((l) => l.action === "metadata.create" && l.summary.includes("Delta"))
    ).toHaveLength(1);
  });

  // UAT #1: Campus/Role fold in the live universities/roles on read, so re-saving
  // them unchanged (with a university added since the row was seeded) diffed as an
  // edit and spammed "Updated member field Campus".
  test("re-saving a synced Campus field after a new university logs no update", async () => {
    const t = await setup();
    const staff = asUser(t, ADMIN);
    await staff.mutation(api.attendanceMetadata.ensureDefaults, {});
    // Added after the Campus row was seeded — list() merges it in on read.
    await staff.mutation(api.admin.upsertUniversity, { year: YEAR, name: "UNSW" });
    const fields = await staff.query(api.attendanceMetadata.list, {});
    // Client saves every field back (values as read) while adding one new field.
    await staff.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        ...fields.map((f, i) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: i,
          values: f.values,
          subgroup: f.subgroup,
          lockedValues: f.lockedValues,
        })),
        { key: "zID", type: "input" as const, order: fields.length },
      ],
      deleteIds: [],
    });

    const meta = (await allLogs(t)).filter((l) => l.entityType === "metadata");
    expect(meta.filter((l) => l.action === "metadata.update")).toHaveLength(0);
    expect(meta.filter((l) => l.action === "metadata.reorder")).toHaveLength(0);
  });

  test("malformed cursor is silently dropped and query restarts from newest", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "Cursor Test Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    // Write a few audit rows so the query has something to return.
    await staff.mutation(api.attendance.signIn, { eventId, email: STAFF });
    // A syntactically invalid JSON string (not parseable by JSON.parse) must not
    // throw — it should be treated as "no cursor" and restart from the beginning.
    const result = await staff.query(api.attendanceAudit.list, {
      paginationOpts: { numItems: 10, cursor: "not-json{{" },
    });
    expect(result.page.length).toBeGreaterThan(0);
    expect(result.isDone).toBe(true);
  });

  test("roll-call by email logs sign-in, record edit and sign-out", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const { dateStart, dateEnd } = window();
    const eventId = await staff.mutation(api.events.create, {
      name: "Email Event",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });

    const attendanceId = await staff.mutation(api.attendance.signIn, {
      eventId,
      email: STAFF,
    });
    await staff.mutation(api.attendance.updateRecord, {
      attendanceId,
      notes: "late arrival",
      signInTime: dateStart + 60_000,
    });
    await staff.mutation(api.attendance.signOut, { eventId, email: STAFF });

    const actions = await actionsFor(t);
    expect(actions).toContain("attendance.signIn");
    expect(actions).toContain("attendance.update");
    expect(actions).toContain("attendance.signOut");
    const edit = (await allLogs(t)).find((l) => l.action === "attendance.update");
    expect(edit?.detail).toContain("notes");
    expect(edit?.subjectEmail).toBe(STAFF);
  });
});
