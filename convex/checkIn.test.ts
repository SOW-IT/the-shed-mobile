import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";
import { checkInOpen, checkInPhase, checkInWindow } from "./checkIn";

const modules = import.meta.glob("./**/*.ts");
const HOUR = 3_600_000;
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * 86_400_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
const YEAR = staffYearForDate(new Date(PINNED_NOW));

const ADMIN = "admin@sow.org.au";
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

async function setup(withCampusField = true) {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: UNSW });
  if (withCampusField) {
    await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 1,
        values: { "1": UNSW, "3": USYD },
      })
    );
  }
  return t;
}

const campusFieldId = (t: T) =>
  t.run(async (ctx) => (await ctx.db.query("attendanceMetadata").collect()).find((f) => f.key === "Campus")!._id);

const createEvent = (t: T, subgroups = [USYD], startOffset = 0, length = 2 * HOUR) =>
  asUser(t, ADMIN).mutation(api.events.create, {
    name: "Weekly",
    dateStart: Date.now() + startOffset,
    dateEnd: Date.now() + startOffset + length,
    subgroups,
  });

const enabled = async (t: T, subgroups?: string[], startOffset?: number) => {
  const eventId = await createEvent(t, subgroups, startOffset);
  const token = await asUser(t, ADMIN).mutation(api.checkIn.enable, { eventId });
  return { eventId, token };
};

const signedInIds = (t: T, eventId: Id<"events">) =>
  t.run(async (ctx) =>
    (await ctx.db.query("attendance").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).map(
      (r) => r.memberId
    )
  );

describe("the check-in window", () => {
  test("opens two hours before the start and closes ten minutes after the end", () => {
    const event = { dateStart: 10 * HOUR, dateEnd: 12 * HOUR };
    expect(checkInWindow(event)).toEqual({ opensAt: 8 * HOUR, closesAt: 12 * HOUR + 600_000 });
    expect(checkInOpen(event, 8 * HOUR - 1)).toBe(false);
    expect(checkInOpen(event, 8 * HOUR)).toBe(true);
    expect(checkInOpen(event, 12 * HOUR + 600_000)).toBe(true);
    expect(checkInOpen(event, 12 * HOUR + 600_001)).toBe(false);
    expect(checkInPhase(event, 8 * HOUR - 1)).toBe("before");
    expect(checkInPhase(event, 9 * HOUR)).toBe("open");
    expect(checkInPhase(event, 12 * HOUR + 600_001)).toBe("after");
  });
});

describe("turning check-in on and off", () => {
  test("a leader turns it on once, gets the same link again, and can turn it off", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    expect(await asUser(t, ADMIN).query(api.checkIn.status, { eventId })).toMatchObject({ token: null, open: true });
    const token = await asUser(t, ADMIN).mutation(api.checkIn.enable, { eventId });
    expect(token).toMatch(/^[0-9a-f]{40}$/);
    expect(await asUser(t, ADMIN).mutation(api.checkIn.enable, { eventId })).toBe(token);
    expect(await asUser(t, ADMIN).query(api.checkIn.status, { eventId })).toMatchObject({ token, enabledAt: expect.any(Number) });

    expect(await t.query(api.checkIn.page, { token })).toMatchObject({
      name: "Weekly",
      campuses: [{ value: USYD, label: "USYD" }],
      open: true,
    });

    await asUser(t, ADMIN).mutation(api.checkIn.disable, { eventId });
    expect(await asUser(t, ADMIN).mutation(api.checkIn.disable, { eventId })).toBeNull();
    expect(await t.query(api.checkIn.page, { token })).toBeNull();
    expect(await asUser(t, ADMIN).query(api.checkIn.status, { eventId })).toMatchObject({ token: null });

    const audit = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["event.checkInEnabled", "event.checkInDisabled"])
    );
  });

  test("signed-out people can't turn it on, read its status or see who is waiting", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    await expect(t.mutation(api.checkIn.enable, { eventId })).rejects.toThrow();
    await expect(t.mutation(api.checkIn.disable, { eventId })).rejects.toThrow();
    expect(await t.query(api.checkIn.status, { eventId })).toBeNull();
    expect(await t.query(api.checkIn.pending, { eventId })).toBeNull();
  });

  test("a missing event is reported", async () => {
    const t = await setup();
    const eventId = await createEvent(t);
    await t.run((ctx) => ctx.db.delete(eventId));
    await expect(asUser(t, ADMIN).mutation(api.checkIn.enable, { eventId })).rejects.toThrow(/not found/);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.disable, { eventId })).rejects.toThrow(/not found/);
    expect(await asUser(t, ADMIN).query(api.checkIn.status, { eventId })).toBeNull();
  });
});

describe("checking in from the public page", () => {
  test("a bad or blank link shows nothing and refuses a check-in", async () => {
    const t = await setup();
    await enabled(t);
    expect(await t.query(api.checkIn.page, { token: "   " })).toBeNull();
    expect(await t.query(api.checkIn.page, { token: "nope" })).toBeNull();
    await expect(
      t.mutation(api.checkIn.submit, { token: "nope", name: "Ann Lee", clientKey: "k" })
    ).rejects.toThrow(/isn't valid/);
  });

  test("a typed name waits for a leader, matched to the one member with that exact name", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const fieldId = await campusFieldId(t);
    const annId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann Lee", metadata: { [fieldId]: "3" } }));
    expect(
      await t.mutation(api.checkIn.submit, { token, name: "  ann   lee ", clientKey: "phone-1" })
    ).toEqual({ status: "pending" });
    expect(
      await t.mutation(api.checkIn.submit, { token, name: "ann lee", clientKey: "phone-1" })
    ).toEqual({ status: "pending" });

    const pending = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      name: "Ann Lee",
      campus: USYD,
      match: { memberId: annId, name: "Ann Lee", campus: USYD, alreadySignedIn: false },
    });
    expect(await signedInIds(t, eventId)).toEqual([]);
  });

  test("two members with the same name are left for the leader to pick", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("attendanceMembers", { name: "Sam Park" });
      await ctx.db.insert("attendanceMembers", { name: "Sam Park" });
    });
    await t.mutation(api.checkIn.submit, { token, name: "Sam Park", clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.match).toBeNull();
  });

  test("names must be real, campuses must belong to the event, and a page needs its key", async () => {
    const t = await setup();
    const { token } = await enabled(t, [USYD, UNSW]);
    expect((await t.query(api.checkIn.page, { token }))?.campuses.map((c) => c.value)).toEqual([USYD, UNSW]);
    await expect(t.mutation(api.checkIn.submit, { token, name: "A", clientKey: "k" })).rejects.toThrow(/full name/);
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "x".repeat(81), clientKey: "k" })
    ).rejects.toThrow(/full name/);
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "  " })
    ).rejects.toThrow(/reload/);
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ann Lee", campus: "Macquarie University", clientKey: "k" })
    ).rejects.toThrow(/campus/);
    expect(
      await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", campus: UNSW, clientKey: "k" })
    ).toEqual({ status: "pending" });
  });

  test("closed before the window opens and after it ends", async () => {
    const t = await setup();
    const { token } = await enabled(t, [USYD], 3 * HOUR);
    expect(await t.query(api.checkIn.page, { token })).toMatchObject({ open: false });
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })
    ).rejects.toThrow(/closed/);
    vi.setSystemTime(PINNED_NOW + HOUR + 1);
    expect(await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })).toEqual({ status: "pending" });
    vi.setSystemTime(PINNED_NOW + 5 * HOUR + 600_001);
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "k" })
    ).rejects.toThrow(/closed/);
  });

  test("an org-wide event offers no campus and stores none", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, ["SOW"]);
    expect((await t.query(api.checkIn.page, { token }))?.campuses).toEqual([]);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.campus).toBeNull();
  });

  test("a flood of check-ins stops at 300 waiting", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 300; i++) {
        await ctx.db.insert("checkInRequests", {
          eventId,
          clientKey: `k${i}`,
          name: `Person ${i}`,
          status: "pending",
          requestedAt: PINNED_NOW,
        });
      }
    });
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "late" })
    ).rejects.toThrow(/see a leader/);
  });
});

describe("a leader handling the waiting list", () => {
  test("confirming a match signs that member in; the page then says confirmed", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const annId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann Lee" }));
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "phone-1" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id })).toMatchObject({ memberId: annId });
    expect(await signedInIds(t, eventId)).toEqual([annId]);
    expect(await asUser(t, ADMIN).query(api.checkIn.pending, { eventId })).toEqual([]);
    expect(await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "phone-1" })).toEqual({
      status: "confirmed",
    });
    await expect(asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id })).rejects.toThrow(/already/);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.dismiss, { requestId: row.id })).rejects.toThrow(/already/);
  });

  test("an unknown name becomes a new member on its campus; the leader can also pick someone else", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const benId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Benjamin Ng" }));
    await t.mutation(api.checkIn.submit, { token, name: "New Person", clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "b" });
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    const fresh = rows.find((r) => r.name === "New Person")!;
    const ben = rows.find((r) => r.name === "Ben Ng")!;
    expect(fresh.match).toBeNull();

    const { memberId } = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: fresh.id });
    const created = await t.run((ctx) => ctx.db.get(memberId));
    expect(created).toMatchObject({ name: "New Person", metadata: expect.objectContaining({ [await campusFieldId(t)]: "3" }) });
    await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: ben.id, memberId: benId });
    expect((await signedInIds(t, eventId)).sort()).toEqual([memberId, benId].sort());
    const audit = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(audit.some((a) => a.summary.includes("from self check-in"))).toBe(true);
  });

  test("a member deleted after matching falls back to a new record; an org-wide name gets no campus", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, ["SOW"]);
    const annId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann Lee" }));
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    await t.run((ctx) => ctx.db.delete(annId));
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.match).toBeNull();
    const { memberId } = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id });
    expect(memberId).not.toBe(annId);
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.metadata).toBeUndefined();
  });

  test("someone already signed in shows as such, and confirming them doesn't sign them in twice", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const annId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann Lee" }));
    await asUser(t, ADMIN).mutation(api.attendance.signIn, { eventId, memberId: annId });
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.match?.alreadySignedIn).toBe(true);
    await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id });
    expect(await signedInIds(t, eventId)).toEqual([annId]);
  });

  test("dismissing removes it without signing anyone in; the same phone can then try again", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    await asUser(t, ADMIN).mutation(api.checkIn.dismiss, { requestId: row.id });
    expect(await asUser(t, ADMIN).query(api.checkIn.pending, { eventId })).toEqual([]);
    expect(await signedInIds(t, eventId)).toEqual([]);
    expect(await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })).toEqual({ status: "pending" });
  });

  test("with no Campus field, or a campus it doesn't list, a new member is made without one", async () => {
    const bare = await setup(false);
    const first = await enabled(bare);
    await bare.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "k" });
    const [a] = (await asUser(bare, ADMIN).query(api.checkIn.pending, { eventId: first.eventId }))!;
    const made = await asUser(bare, ADMIN).mutation(api.checkIn.confirm, { requestId: a.id });
    expect((await bare.run((ctx) => ctx.db.get(made.memberId)))?.metadata).toBeUndefined();

    const t = await setup();
    await t.run(async (ctx) => {
      const field = (await ctx.db.query("attendanceMetadata").collect())[0];
      await ctx.db.patch(field._id, { values: { "1": UNSW } });
    });
    const second = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: second.token, name: "Ben Ng", clientKey: "k" });
    const [b] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: second.eventId }))!;
    const other = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: b.id });
    expect((await t.run((ctx) => ctx.db.get(other.memberId)))?.metadata).toBeUndefined();
  });

  test("a request whose event is gone, or that is gone itself, can't be confirmed", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "k" });
    const [first, second] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    await t.run((ctx) => ctx.db.delete(first.id));
    await expect(asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: first.id })).rejects.toThrow(/already/);
    await t.run((ctx) => ctx.db.delete(eventId));
    await expect(asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: second.id })).rejects.toThrow(/not found/);
  });
});
