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
      universities: [{ value: USYD, label: "USYD" }],
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
    ).toEqual({ status: "pending", automatic: false });
    expect(
      await t.mutation(api.checkIn.submit, { token, name: "ann lee", clientKey: "phone-1" })
    ).toEqual({ status: "pending", automatic: false });

    const pending = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      name: "Ann Lee",
      campus: USYD,
      choices: [],
      match: { memberId: annId, name: "Ann Lee", campus: USYD, alreadySignedIn: false },
    });
    expect(await signedInIds(t, eventId)).toEqual([]);
  });

  test("two members with the same name are offered to the leader, who has to pick one", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const fieldId = await campusFieldId(t);
    const [first, second] = await t.run(async (ctx) => [
      await ctx.db.insert("attendanceMembers", { name: "Sam Park", metadata: { [fieldId]: "3" } }),
      await ctx.db.insert("attendanceMembers", { name: "Sam Park" }),
    ]);
    await t.mutation(api.checkIn.submit, { token, name: "Sam Park", clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.match).toBeNull();
    expect(row.choices).toEqual(
      expect.arrayContaining([
        { memberId: first, campus: USYD },
        { memberId: second, campus: null },
      ])
    );
    await expect(asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id })).rejects.toThrow(
      /Pick them, or add a new member/
    );
    await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id, memberId: second });
    expect(await signedInIds(t, eventId)).toEqual([second]);
    expect((await t.run((ctx) => ctx.db.query("attendanceMembers").collect())).filter((m) => m.name === "Sam Park")).toHaveLength(2);
  });

  test("names must be real, campuses must belong to the event, and a page needs its key", async () => {
    const t = await setup();
    const { token } = await enabled(t, [USYD, UNSW]);
    expect((await t.query(api.checkIn.page, { token }))?.universities.map((c) => c.value)).toEqual([USYD, UNSW]);
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
    ).toEqual({ status: "pending", automatic: false });
  });

  test("closed before the window opens and after it ends", async () => {
    const t = await setup();
    const { token } = await enabled(t, [USYD], 3 * HOUR);
    expect(await t.query(api.checkIn.page, { token })).toMatchObject({ open: false });
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })
    ).rejects.toThrow(/closed/);
    vi.setSystemTime(PINNED_NOW + HOUR + 1);
    expect(await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })).toEqual({ status: "pending", automatic: false });
    vi.setSystemTime(PINNED_NOW + 5 * HOUR + 600_001);
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "k" })
    ).rejects.toThrow(/closed/);
  });

  test("an org-wide event offers every university this year, and a campus is optional", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, ["SOW"]);
    const offered = (await t.query(api.checkIn.page, { token }))!.universities.map((c) => c.value);
    expect(offered).toEqual(expect.arrayContaining([USYD, UNSW]));
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", campus: UNSW, clientKey: "k" });
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Cy Ho", campus: "Nowhere University", clientKey: "k" })
    ).rejects.toThrow(/campus/);
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(rows.find((r) => r.name === "Ann Lee")?.campus).toBeNull();
    expect(rows.find((r) => r.name === "Ben Ng")?.campus).toBe(UNSW);
  });

  test("a year at uni is optional, must be one on the list, and reaches the leader", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, [USYD, UNSW]);
    expect((await t.query(api.checkIn.page, { token }))?.calendarYear).toBe(
      Number(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric" }).format(PINNED_NOW))
    );
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", yearLevel: "2", clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", yearLevel: " ", clientKey: "b" });
    await expect(
      t.mutation(api.checkIn.submit, { token, name: "Cy Ho", yearLevel: "7", clientKey: "c" })
    ).rejects.toThrow(/year/);
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(rows.find((r) => r.name === "Ann Lee")?.yearLevel).toBe("2");
    expect(rows.find((r) => r.name === "Ben Ng")?.yearLevel).toBeNull();
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
      automatic: false,
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
    expect(await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "k" })).toEqual({ status: "pending", automatic: false });
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

  test("a single same-named member on another campus is offered, not assumed, and can be passed over", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, [USYD, UNSW]);
    const fieldId = await campusFieldId(t);
    const otherCampus = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Kim Lee", metadata: { [fieldId]: "1" } })
    );
    await t.mutation(api.checkIn.submit, { token, name: "Kim Lee", campus: USYD, clientKey: "k" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(row.match).toBeNull();
    expect(row.choices).toEqual([{ memberId: otherCampus, campus: UNSW }]);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id })).rejects.toThrow(
      /add a new member/
    );
    const { memberId } = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id, asNew: true });
    expect(memberId).not.toBe(otherCampus);
    expect(await signedInIds(t, eventId)).toEqual([memberId]);

    await t.mutation(api.checkIn.submit, { token, name: "Kim Lee", campus: UNSW, clientKey: "k2" });
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(rows[0].choices.length).toBeGreaterThan(0);
  });

  test("a same-named member on the same campus, or one with no campus, is matched straight away", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t, [USYD, UNSW]);
    const fieldId = await campusFieldId(t);
    const same = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Jo Tan", metadata: { [fieldId]: "3" } })
    );
    const noCampus = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ray Ng" }));
    await t.mutation(api.checkIn.submit, { token, name: "Jo Tan", campus: USYD, clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token, name: "Ray Ng", campus: UNSW, clientKey: "b" });
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(rows.find((r) => r.name === "Jo Tan")?.match?.memberId).toBe(same);
    expect(rows.find((r) => r.name === "Ray Ng")?.match?.memberId).toBe(noCampus);
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

const yearFieldId = (t: T) =>
  t.run((ctx) => ctx.db.insert("attendanceMetadata", { key: "Year", type: "select", order: 0, values: { "1": "1", "2": "2" } }));

const signInTimes = (t: T, eventId: Id<"events">) =>
  t.run(async (ctx) =>
    Object.fromEntries(
      (await ctx.db.query("attendance").withIndex("by_event", (q) => q.eq("eventId", eventId)).collect()).map(
        (r) => [r.memberId, r.signInTime]
      )
    )
  );

describe("sign-in times and new members' details", () => {
  test("a confirmed check-in keeps the time the person checked in, not when a leader confirmed it", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const annId = await t.run((ctx) => ctx.db.insert("attendanceMembers", { name: "Ann Lee" }));
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "a" });
    vi.setSystemTime(PINNED_NOW + 60_000);
    await t.mutation(api.checkIn.submit, { token, name: "New Person", clientKey: "b" });
    vi.setSystemTime(PINNED_NOW + 25 * 60_000);
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: rows[0].id });
    const { memberId } = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: rows[1].id });
    const times = await signInTimes(t, eventId);
    expect(times[annId]).toBe(rows[0].requestedAt);
    expect(times[memberId]).toBe(rows[1].requestedAt);
    expect(rows[1].requestedAt - rows[0].requestedAt).toBeGreaterThanOrEqual(60_000);
  });

  test("a new member gets the campus and year they gave; 6+ counts back five years", async () => {
    const t = await setup();
    const yearId = await yearFieldId(t);
    const { eventId, token } = await enabled(t);
    const calendarYear = (await t.query(api.checkIn.page, { token }))!.calendarYear;
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", yearLevel: "2", clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", yearLevel: "6+", clientKey: "b" });
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    const ann = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: rows[0].id });
    const ben = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: rows[1].id });
    const fieldId = await campusFieldId(t);
    expect((await t.run((ctx) => ctx.db.get(ann.memberId)))?.metadata).toEqual({
      [fieldId]: "3",
      [yearId]: String(calendarYear - 1),
    });
    expect((await t.run((ctx) => ctx.db.get(ben.memberId)))?.metadata?.[yearId]).toBe(String(calendarYear - 5));
  });

  test("a year with no Year field to hold it, or a stored level that isn't on the list, is left off", async () => {
    const t = await setup(false);
    const { eventId, token } = await enabled(t, ["SOW"]);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", yearLevel: "3", clientKey: "a" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    const made = await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id });
    expect((await t.run((ctx) => ctx.db.get(made.memberId)))?.metadata).toBeUndefined();

    const withYear = await setup(false);
    await yearFieldId(withYear);
    const second = await enabled(withYear, ["SOW"]);
    const requestId = await withYear.run((ctx) =>
      ctx.db.insert("checkInRequests", {
        eventId: second.eventId,
        clientKey: "k",
        name: "Old Request",
        yearLevel: "9",
        status: "pending",
        requestedAt: PINNED_NOW,
      })
    );
    const old = await asUser(withYear, ADMIN).mutation(api.checkIn.confirm, { requestId });
    expect((await withYear.run((ctx) => ctx.db.get(old.memberId)))?.metadata).toBeUndefined();
  });
});

describe("confirming every match at once", () => {
  test("signs in each matched person at their own time and leaves the rest waiting", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const [annId, benId] = await t.run(async (ctx) => [
      await ctx.db.insert("attendanceMembers", { name: "Ann Lee" }),
      await ctx.db.insert("attendanceMembers", { name: "Ben Ng" }),
    ]);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "a" });
    vi.setSystemTime(PINNED_NOW + 60_000);
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "b" });
    await t.mutation(api.checkIn.submit, { token, name: "New Person", clientKey: "c" });
    vi.setSystemTime(PINNED_NOW + 30 * 60_000);
    const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    const ids = rows.map((r) => r.id);
    expect(
      await asUser(t, ADMIN).mutation(api.checkIn.confirmMatched, { requestIds: [...ids, ids[0]] })
    ).toEqual({ confirmed: 2 });
    const times = await signInTimes(t, eventId);
    expect(times[annId]).toBe(rows[0].requestedAt);
    expect(times[benId]).toBe(rows[1].requestedAt);
    const left = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    expect(left.map((r) => r.name)).toEqual(["New Person"]);
    expect(await asUser(t, ADMIN).mutation(api.checkIn.confirmMatched, { requestIds: ids })).toEqual({ confirmed: 0 });
  });

  test("skips a match whose member or event has gone, and needs a leader and a sensible batch", async () => {
    const t = await setup();
    const first = await enabled(t);
    const second = await enabled(t);
    const [annId] = await t.run(async (ctx) => [
      await ctx.db.insert("attendanceMembers", { name: "Ann Lee" }),
      await ctx.db.insert("attendanceMembers", { name: "Ben Ng" }),
    ]);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token: second.token, name: "Ben Ng", clientKey: "b" });
    const [ann] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: first.eventId }))!;
    const [ben] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: second.eventId }))!;
    await t.run(async (ctx) => {
      await ctx.db.delete(annId);
      await ctx.db.delete(second.eventId);
    });
    await expect(t.mutation(api.checkIn.confirmMatched, { requestIds: [ann.id] })).rejects.toThrow();
    expect(
      await asUser(t, ADMIN).mutation(api.checkIn.confirmMatched, { requestIds: [ann.id, ben.id] })
    ).toEqual({ confirmed: 0 });
    await expect(
      asUser(t, ADMIN).mutation(api.checkIn.confirmMatched, { requestIds: Array(301).fill(ann.id) })
    ).rejects.toThrow(/fewer/);
  });
});

describe("a leader opening the link", () => {
  test("signed out, the page has no viewer; a signed-in non-leader is shown the form with their name", async () => {
    const t = await setup();
    const { token } = await enabled(t);
    expect((await t.query(api.checkIn.page, { token }))?.viewer).toBeNull();
    const userId = await t.run((ctx) => ctx.db.insert("users", { email: "ann@gmail.com", name: "ann lee" }));
    const visitor = t.withIdentity({ subject: `${userId}|s`, issuer: "test" });
    expect((await visitor.query(api.checkIn.page, { token }))?.viewer).toEqual({
      leader: false,
      eventId: null,
      name: "Ann Lee",
      signedIn: false,
    });
    expect((await asUser(t, "nobody@gmail.com").query(api.checkIn.page, { token }))?.viewer).toEqual({
      leader: false,
      eventId: null,
      name: null,
      signedIn: false,
    });
    await expect(visitor.mutation(api.checkIn.signInLeader, { token })).rejects.toThrow(/Only leaders/);
    await expect(t.mutation(api.checkIn.signInLeader, { token })).rejects.toThrow(/signed in/);
    expect(await visitor.mutation(api.checkIn.signOutLeader, { token })).toBe(false);
  });

  test("signs a leader straight in, once, and lets them undo it", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    expect((await asUser(t, ADMIN).query(api.checkIn.page, { token }))?.viewer).toMatchObject({
      leader: true,
      eventId,
      signedIn: false,
    });
    const first = await asUser(t, ADMIN).mutation(api.checkIn.signInLeader, { token });
    expect(first).toMatchObject({ alreadySignedIn: false, name: expect.any(String) });
    expect(await asUser(t, ADMIN).mutation(api.checkIn.signInLeader, { token })).toMatchObject({
      alreadySignedIn: true,
    });
    expect(await signedInIds(t, eventId)).toHaveLength(1);
    expect((await asUser(t, ADMIN).query(api.checkIn.page, { token }))?.viewer).toMatchObject({
      leader: true,
      signedIn: true,
      name: first.name,
    });
    expect(await asUser(t, ADMIN).mutation(api.checkIn.signOutLeader, { token })).toBe(true);
    expect(await asUser(t, ADMIN).mutation(api.checkIn.signOutLeader, { token })).toBe(false);
    expect(await signedInIds(t, eventId)).toEqual([]);
    const audit = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["attendance.signIn", "attendance.signOut"]));
  });

  test("a leader whose profile has no member row yet gets one; a closed or bad link refuses", async () => {
    const t = await setup();
    const early = await enabled(t, [USYD], 3 * HOUR);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.signInLeader, { token: early.token })).rejects.toThrow(/closed/);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.signInLeader, { token: "nope" })).rejects.toThrow(/isn't valid/);
    await expect(asUser(t, ADMIN).mutation(api.checkIn.signOutLeader, { token: "nope" })).rejects.toThrow(/isn't valid/);
    expect((await asUser(t, ADMIN).query(api.checkIn.page, { token: early.token }))?.viewer).toMatchObject({
      leader: true,
      signedIn: false,
    });
  });
});

const confirmFirst = async (t: T, eventId: Id<"events">, name: string) => {
  const rows = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
  const row = rows.find((r) => r.name === name)!;
  return (await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id })).memberId;
};

describe("someone a leader has already matched, checking in again from the same phone", () => {
  test("is signed straight in at a later event, under their own name only", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "New Person", clientKey: "phone" });
    expect(await t.query(api.checkIn.mine, { token: first.token, clientKey: "phone", name: "new person" })).toBe(
      "pending"
    );
    const memberId = await confirmFirst(t, first.eventId, "New Person");
    expect(await t.query(api.checkIn.mine, { token: first.token, clientKey: "phone", name: "New Person" })).toBe(
      "confirmed"
    );

    vi.setSystemTime(PINNED_NOW + 7 * 24 * HOUR);
    const second = await enabled(t);
    expect(
      await t.mutation(api.checkIn.submit, { token: second.token, name: "new person", clientKey: "phone" })
    ).toEqual({ status: "confirmed", automatic: true });
    expect(await signedInIds(t, second.eventId)).toEqual([memberId]);
    expect((await signInTimes(t, second.eventId))[memberId]).toBeGreaterThanOrEqual(PINNED_NOW + 7 * 24 * HOUR);
    expect(await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: second.eventId })).toEqual([]);
    expect(
      await t.mutation(api.checkIn.submit, { token: second.token, name: "New Person", clientKey: "phone" })
    ).toEqual({ status: "confirmed", automatic: false });

    await t.mutation(api.checkIn.submit, { token: second.token, name: "Their Friend", clientKey: "phone" });
    await t.mutation(api.checkIn.submit, { token: second.token, name: "New Person", clientKey: "other-phone" });
    const waiting = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: second.eventId }))!;
    expect(waiting.map((r) => r.name).sort()).toEqual(["New Person", "Their Friend"]);
    const audit = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(audit.some((a) => a.actorEmail === "system:self-check-in" && a.action === "attendance.signIn")).toBe(true);
  });

  test("follows a member renamed since, and falls back to waiting once that member is gone", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Jon Smith", clientKey: "phone" });
    const memberId = await confirmFirst(t, first.eventId, "Jon Smith");
    await t.run((ctx) => ctx.db.patch(memberId, { name: "John Smith" }));

    const second = await enabled(t);
    expect(
      await t.mutation(api.checkIn.submit, { token: second.token, name: "John Smith", clientKey: "phone" })
    ).toEqual({ status: "confirmed", automatic: true });

    await t.run((ctx) => ctx.db.delete(memberId));
    const third = await enabled(t);
    expect(
      await t.mutation(api.checkIn.submit, { token: third.token, name: "Jon Smith", clientKey: "phone" })
    ).toEqual({ status: "pending", automatic: false });
    expect(await t.query(api.checkIn.mine, { token: "nope", clientKey: "phone", name: "Jon Smith" })).toBeNull();
    expect(await t.query(api.checkIn.mine, { token: third.token, clientKey: " ", name: "Jon Smith" })).toBeNull();
    expect(await t.query(api.checkIn.mine, { token: third.token, clientKey: "phone", name: "Nobody" })).toBeNull();
  });

  test("a check-in for someone else never makes the phone known for them", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, {
      token: first.token,
      name: "Their Friend",
      clientKey: "phone",
      forSomeoneElse: true,
    });
    await confirmFirst(t, first.eventId, "Their Friend");
    const second = await enabled(t);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "Their Friend" })).toBe(
      false
    );
    expect(
      await t.mutation(api.checkIn.submit, { token: second.token, name: "Their Friend", clientKey: "phone" })
    ).toEqual({ status: "pending", automatic: false });
  });

  test("a match a leader later undid in the roll call stops counting", async () => {
    const t = await setup();
    const first = await enabled(t);
    const [wrong, right] = await t.run(async (ctx) => [
      await ctx.db.insert("attendanceMembers", { name: "Ann Lee" }),
      await ctx.db.insert("attendanceMembers", { name: "Ann Lea" }),
    ]);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" });
    await asUser(t, ADMIN).mutation(api.checkIn.confirmMatched, {
      requestIds: (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: first.eventId }))!.map((r) => r.id),
    });
    await asUser(t, ADMIN).mutation(api.attendance.signOut, { eventId: first.eventId, memberId: wrong });
    await asUser(t, ADMIN).mutation(api.attendance.signIn, { eventId: first.eventId, memberId: right });
    expect(await t.query(api.checkIn.mine, { token: first.token, clientKey: "phone", name: "Ann Lee" })).toBe(
      "dismissed"
    );
    const second = await enabled(t);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(
      false
    );
    expect(
      await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" })
    ).toEqual({ status: "pending", automatic: false });
  });

  test("sees every check-in from a phone used for many people", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    for (let i = 0; i < 12; i++) {
      await t.mutation(api.checkIn.submit, { token, name: `Person Number${i}`, clientKey: "kiosk", forSomeoneElse: true });
    }
    expect(await t.mutation(api.checkIn.submit, { token, name: "Person Number11", clientKey: "kiosk" })).toEqual({
      status: "pending",
      automatic: false,
    });
    expect((await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!).toHaveLength(12);
    expect(await t.query(api.checkIn.mine, { token, clientKey: "kiosk", name: "Person Number11" })).toBe("pending");
  });
});

describe("opening the link again on a phone that has checked in before", () => {
  test("knows the phone and name, signs them in, and Undo removes it and forgets the phone", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" });
    const second = await enabled(t);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    const memberId = await confirmFirst(t, first.eventId, "Ann Lee");
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: " ann  lee" })).toBe(true);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "Ben Ng" })).toBe(false);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "laptop", name: "Ann Lee" })).toBe(false);
    expect(await t.query(api.checkIn.returning, { token: "nope", clientKey: "phone", name: "Ann Lee" })).toBe(false);
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "A" })).toBe(false);

    expect(await t.mutation(api.checkIn.undoMine, { token: first.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    expect(await signedInIds(t, first.eventId)).toEqual([memberId]);
    await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" });
    expect(await signedInIds(t, second.eventId)).toEqual([memberId]);
    expect(await t.mutation(api.checkIn.undoMine, { token: second.token, clientKey: "laptop", name: "Ann Lee" })).toBe(false);
    expect(await t.mutation(api.checkIn.undoMine, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(true);
    expect(await signedInIds(t, second.eventId)).toEqual([]);
    expect(await t.query(api.checkIn.mine, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(
      "dismissed"
    );
    expect(await t.mutation(api.checkIn.undoMine, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    await expect(t.mutation(api.checkIn.undoMine, { token: "nope", clientKey: "phone", name: "Ann Lee" })).rejects.toThrow(
      /isn't valid/
    );
    expect(await t.query(api.checkIn.returning, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    expect(await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "pending",
      automatic: false,
    });
  });

  test("a known phone whose person a leader already signed in gets no Undo, and Undo can't remove that sign-in", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" });
    const memberId = await confirmFirst(t, first.eventId, "Ann Lee");
    const second = await enabled(t);
    await asUser(t, ADMIN).mutation(api.attendance.signIn, { eventId: second.eventId, memberId });
    expect(await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "confirmed",
      automatic: false,
    });
    expect(await t.mutation(api.checkIn.undoMine, { token: second.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    expect(await signedInIds(t, second.eventId)).toEqual([memberId]);

    const third = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: third.token, name: "Ann Lee", clientKey: "phone" });
    await asUser(t, ADMIN).mutation(api.attendance.signOut, { eventId: third.eventId, memberId });
    await asUser(t, ADMIN).mutation(api.attendance.signIn, { eventId: third.eventId, memberId });
    expect(await t.mutation(api.checkIn.undoMine, { token: third.token, clientKey: "phone", name: "Ann Lee" })).toBe(false);
    expect(await signedInIds(t, third.eventId)).toEqual([memberId]);
  });
});

describe("a sign-in confirmed late", () => {
  test("keeps the check-in time and can still be undone by a leader just after", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "a" });
    vi.setSystemTime(PINNED_NOW + 2 * HOUR + 15 * 60_000);
    const memberId = await confirmFirst(t, eventId, "Ann Lee");
    expect((await signInTimes(t, eventId))[memberId]).toBeLessThan(PINNED_NOW + HOUR);
    await asUser(t, ADMIN).mutation(api.attendance.signOut, { eventId, memberId });
    expect(await signedInIds(t, eventId)).toEqual([]);
  });
});

describe("org-wide events", () => {
  test("offer every university", async () => {
    const t = await setup();
    const { token } = await enabled(t, ["SOW"]);
    const page = (await t.query(api.checkIn.page, { token }))!;
    expect(page.universities.map((c) => c.value)).toEqual(expect.arrayContaining([USYD, UNSW]));
  });
});

describe("deleting an event", () => {
  test("removes its check-in requests along with its attendance", async () => {
    const t = await setup();
    const { eventId, token } = await enabled(t);
    const other = await enabled(t);
    await t.mutation(api.checkIn.submit, { token, name: "Ann Lee", clientKey: "a" });
    await t.mutation(api.checkIn.submit, { token, name: "Ben Ng", clientKey: "b" });
    await t.mutation(api.checkIn.submit, { token: other.token, name: "Cy Ho", clientKey: "c" });
    const [row] = (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId }))!;
    await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id });
    await asUser(t, ADMIN).mutation(api.events.remove, { eventId });
    const left = await t.run((ctx) => ctx.db.query("checkInRequests").collect());
    expect(left.map((r) => r.name)).toEqual(["Cy Ho"]);
  });
});

describe("a leader's say over a known phone", () => {
  test("a sign-in a leader removed isn't put back by the phone at that event", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" });
    const memberId = await confirmFirst(t, first.eventId, "Ann Lee");
    const second = await enabled(t);
    expect(await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "confirmed",
      automatic: true,
    });
    await asUser(t, ADMIN).mutation(api.attendance.signOut, { eventId: second.eventId, memberId });
    expect(await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "pending",
      automatic: false,
    });
    expect(await t.mutation(api.checkIn.submit, { token: second.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "pending",
      automatic: false,
    });
    expect(await signedInIds(t, second.eventId)).toEqual([]);
    const third = await enabled(t);
    expect(await t.mutation(api.checkIn.submit, { token: third.token, name: "Ann Lee", clientKey: "phone" })).toEqual({
      status: "confirmed",
      automatic: true,
    });
  });

  test("a phone that checked in many other people still knows its owner", async () => {
    const t = await setup();
    const first = await enabled(t);
    await t.mutation(api.checkIn.submit, { token: first.token, name: "Ann Lee", clientKey: "phone" });
    await confirmFirst(t, first.eventId, "Ann Lee");
    const second = await enabled(t);
    for (let i = 0; i < 25; i++) {
      await t.mutation(api.checkIn.submit, {
        token: second.token,
        name: `Guest Number${i}`,
        clientKey: "phone",
        forSomeoneElse: true,
      });
    }
    for (const row of (await asUser(t, ADMIN).query(api.checkIn.pending, { eventId: second.eventId }))!) {
      await asUser(t, ADMIN).mutation(api.checkIn.confirm, { requestId: row.id });
    }
    const third = await enabled(t);
    expect(await t.query(api.checkIn.returning, { token: third.token, clientKey: "phone", name: "Ann Lee" })).toBe(true);
  });
});
