/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { googleEventId } from "../shared/calendar";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const NOW = staffYearStartMs(staffYearForDate(new Date())) + 120 * DAY;
const YEAR = staffYearForDate(new Date(NOW));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ADMIN = "admin@sow.org.au";
const USYD = "University of Sydney";
const CALENDAR = "sow-calendar@group.calendar.google.com";

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  const [twig, ppn] = await t.run(async (ctx) => [
    await ctx.db.insert("attendanceTags", { name: "TWIG", colour: "#123456" }),
    await ctx.db.insert("attendanceTags", { name: "PPN" }),
  ]);
  return { t, twig, ppn };
}

const at = (dayOffset: number, hours = 2) => ({
  dateStart: NOW + dayOffset * DAY,
  dateEnd: NOW + dayOffset * DAY + hours * 3_600_000,
});

const create = (t: T, args: Partial<FunctionArgs<typeof api.events.create>> & { name: string }) =>
  asUser(t, ADMIN).mutation(api.events.create, { subgroups: [USYD], ...at(1), ...args });

const scheduledSyncs = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).filter((f) =>
      f.name.startsWith("googleCalendar")
    )
  );

async function privateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
}

async function configureGoogle() {
  vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "sa@project.iam.gserviceaccount.com");
  vi.stubEnv("GOOGLE_SA_PRIVATE_KEY", (await privateKeyPem()).replace(/\n/g, "\\n"));
  vi.stubEnv("GOOGLE_CALENDAR_ID", CALENDAR);
}

// Answers the token exchange, then each Calendar call in turn with `statuses`.
const googleFetch = (statuses: number[]) => {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes("oauth2")) {
      return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
    }
    calls.push({
      method: init?.method ?? "GET",
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const status = statuses.shift() ?? 200;
    return new Response(status === 204 ? null : "{}", { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

describe("calendar.range", () => {
  test("lists the window's events with a category for each", async () => {
    const { t, twig, ppn } = await setup();
    await create(t, { name: "TWIG night", tagIds: [twig] });
    await create(t, { name: "PPN", tagIds: [twig, ppn] });
    await create(t, { name: "Leaders' retreat", subgroups: ["SOW"] });
    await create(t, { name: "Welcome week stall" });
    await create(t, { name: "Camp", ...at(-3, 5 * 24) });
    await create(t, { name: "Long gone", ...at(-20) });
    await create(t, { name: "Next month", ...at(40) });

    const rows = await asUser(t, ADMIN).query(api.calendar.range, {
      from: NOW,
      to: NOW + 10 * DAY,
    });
    expect(rows!.map((r) => [r.name, r.category])).toEqual([
      ["Camp", "campus"],
      ["TWIG night", "twig"],
      ["PPN", "ppn"],
      ["Leaders' retreat", "sow"],
      ["Welcome week stall", "campus"],
    ]);
    expect(rows![0].subgroups).toEqual([USYD]);
    expect(rows![1].tags).toEqual([{ name: "TWIG", colour: "#123456" }]);
    expect(await t.query(api.calendar.range, { from: NOW, to: NOW + DAY })).toBeNull();
  });

  test("a deleted tag is left out", async () => {
    const { t, twig } = await setup();
    await create(t, { name: "TWIG night", tagIds: [twig] });
    await t.run((ctx) => ctx.db.delete("attendanceTags", twig));
    const [row] = (await asUser(t, ADMIN).query(api.calendar.range, { from: NOW, to: NOW + 9 * DAY }))!;
    expect(row).toMatchObject({ category: "campus", tags: [] });
  });
});

describe("googleCalendar.syncEvent", () => {
  test("does nothing until a calendar is set up", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Welcome week stall" });
    const calls = googleFetch([]);
    await t.action(internal.googleCalendar.syncEvent, { eventId });
    expect(calls).toHaveLength(0);
  });

  test("updates the Google event, adding it when it isn't there yet", async () => {
    const { t, twig } = await setup();
    const eventId = await create(t, { name: "TWIG night", tagIds: [twig] });
    await configureGoogle();

    let calls = googleFetch([200]);
    await t.action(internal.googleCalendar.syncEvent, { eventId });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR)}/events/${googleEventId(eventId)}`
    );
    expect(calls[0].body).toMatchObject({
      summary: "TWIG night",
      colorId: "10",
      status: "confirmed",
      start: { timeZone: "Australia/Sydney" },
    });
    expect(String(calls[0].body!.description)).toContain(`/attendance/event/${eventId}`);

    calls = googleFetch([404, 200]);
    await t.action(internal.googleCalendar.syncEvent, { eventId });
    expect(calls.map((c) => c.method)).toEqual(["PUT", "POST"]);
    expect(calls[1].url).toMatch(/\/events$/);
    expect(calls[1].body!.id).toBe(googleEventId(eventId));
  });

  test("reports Google's errors", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Stall" });
    await configureGoogle();
    googleFetch([500]);
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow(
      "Google Calendar update failed: 500"
    );
    googleFetch([404, 403]);
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow(
      "Google Calendar insert failed: 403"
    );
  });

  test("removes a deleted event from Google, even if it's already gone there", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Cancelled stall" });
    await asUser(t, ADMIN).mutation(api.events.remove, { eventId });
    await configureGoogle();
    for (const status of [204, 410]) {
      const calls = googleFetch([status]);
      await t.action(internal.googleCalendar.syncEvent, { eventId });
      expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
    }
    googleFetch([500]);
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow(
      "Google Calendar delete failed: 500"
    );
  });

  test("the token exchange failing is reported", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Stall" });
    await configureGoogle();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow(
      "Google token exchange failed: nope"
    );
  });
});

describe("googleCalendar.backfill", () => {
  test("copies events from the chosen number of days back", async () => {
    const { t } = await setup();
    await expect(t.action(internal.googleCalendar.backfill, { daysBack: 30 })).rejects.toThrow(
      "Set GOOGLE_CALENDAR_ID"
    );
    const ids: Id<"events">[] = [];
    for (const [name, offset] of [["Old", -60], ["Recent", -5], ["Soon", 3]] as const) {
      ids.push(await create(t, { name, ...at(offset) }));
    }
    await configureGoogle();
    const calls = googleFetch([]);
    expect(await t.action(internal.googleCalendar.backfill, { daysBack: 30 })).toEqual({ synced: 2 });
    expect(calls.map((c) => c.body!.summary)).toEqual(["Recent", "Soon"]);
  });
});

const STAFF = "staff@sow.org.au";
const OTHER = "other@sow.org.au";

async function setupWithStaff() {
  const base = await setup();
  for (const email of [STAFF, OTHER]) {
    await asUser(base.t, ADMIN).mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email,
      roles: ["Staff"],
      department: "Marketing",
    });
  }
  return base;
}

const entry = (over: Record<string, unknown> = {}) => ({
  name: "Camp posters due",
  ...at(3),
  ...over,
});

describe("calendar entries", () => {
  test("anyone with a role adds one; it's checked and listed with who can change it", async () => {
    const { t } = await setupWithStaff();
    await expect(t.mutation(api.calendar.addEntry, entry())).rejects.toThrow("You must be signed in");
    const add = (over: Record<string, unknown>) => asUser(t, STAFF).mutation(api.calendar.addEntry, entry(over));
    await expect(add({ name: "  " })).rejects.toThrow("Give it a name.");
    await expect(add({ dateEnd: NOW + 3 * DAY })).rejects.toThrow("It has to end after it starts.");
    const id = await add({ name: " Camp posters due ", notes: " Print 200 " });
    expect(await t.run((ctx) => ctx.db.get("calendarEntries", id))).toMatchObject({
      name: "Camp posters due",
      notes: "Print 200",
      createdBy: STAFF,
    });

    const window = { from: NOW, to: NOW + 10 * DAY };
    const mine = await asUser(t, STAFF).query(api.calendar.range, window);
    expect(mine).toEqual([
      expect.objectContaining({ kind: "entry", id, category: "event", notes: "Print 200", canEdit: true }),
    ]);
    expect((await asUser(t, OTHER).query(api.calendar.range, window))![0].canEdit).toBe(false);
    expect((await asUser(t, ADMIN).query(api.calendar.range, window))![0].canEdit).toBe(true);
  });

  test("only whoever added it, or an admin, can change or delete it", async () => {
    const { t } = await setupWithStaff();
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    await expect(
      asUser(t, OTHER).mutation(api.calendar.updateEntry, { id, ...entry({ name: "Mine now" }) })
    ).rejects.toThrow("Only whoever added it, or an admin");
    await asUser(t, ADMIN).mutation(api.calendar.updateEntry, { id, ...entry({ name: "Posters due" }) });
    expect(await t.run((ctx) => ctx.db.get("calendarEntries", id))).toMatchObject({
      name: "Posters due",
    });
    await expect(asUser(t, OTHER).mutation(api.calendar.removeEntry, { id })).rejects.toThrow("Only whoever");
    await asUser(t, STAFF).mutation(api.calendar.removeEntry, { id });
    await expect(asUser(t, STAFF).mutation(api.calendar.removeEntry, { id })).rejects.toThrow(
      "That calendar entry no longer exists."
    );
  });

  test("a deadline is one moment, and saving it as an event clears it", async () => {
    const { t } = await setupWithStaff();
    const due = { dateStart: NOW + 3 * DAY, dateEnd: NOW + 3 * DAY, due: "time" as const };
    await expect(
      asUser(t, STAFF).mutation(api.calendar.addEntry, entry({ ...due, dateEnd: NOW + 3 * DAY + 1 }))
    ).rejects.toThrow("A deadline is one moment, with no end.");
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry(due));
    const window = { from: NOW, to: NOW + 10 * DAY };
    await create(t, { name: "Stall" });
    const listed = await asUser(t, STAFF).query(api.calendar.range, window);
    expect(listed!.map((e) => [e.name, e.due])).toEqual([
      ["Stall", null],
      ["Camp posters due", "time"],
    ]);

    await asUser(t, STAFF).mutation(api.calendar.updateEntry, { id, ...entry() });
    const saved = await t.run((ctx) => ctx.db.get("calendarEntries", id));
    expect(saved).not.toHaveProperty("due");
    expect(saved!.dateEnd).toBeGreaterThan(saved!.dateStart);
  });

  test("an entry needs no campus", async () => {
    const { t } = await setupWithStaff();
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    const [row] = (await asUser(t, STAFF).query(api.calendar.range, { from: NOW, to: NOW + 10 * DAY }))!;
    expect(row).toMatchObject({ id, subgroups: [], category: "event" });
  });

  test("taking attendance turns an entry into an attendance event, in one go", async () => {
    const { t } = await setupWithStaff();
    await configureGoogle();
    googleFetch([]);
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    const asEvent = { name: "Camp posters due", subgroups: [USYD], ...at(3), replacesEntryId: id };
    await expect(asUser(t, OTHER).mutation(api.events.create, asEvent)).rejects.toThrow("Only whoever added it");
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(0);

    const eventId = await asUser(t, STAFF).mutation(api.events.create, asEvent);
    expect(await t.run((ctx) => ctx.db.get("calendarEntries", id))).toBeNull();
    const rows = await asUser(t, STAFF).query(api.calendar.range, { from: NOW, to: NOW + 10 * DAY });
    expect(rows!.map((r) => [r.kind, r.id, r.category])).toEqual([["attendance", eventId, "campus"]]);
    expect((await scheduledSyncs(t)).map((f) => [f.name, f.args[0]])).toEqual(
      expect.arrayContaining([
        ["googleCalendar:syncEntry", { entryId: id }],
        ["googleCalendar:syncEvent", { eventId }],
      ])
    );
  });

  test("changes are copied to Google once a calendar is set up", async () => {
    const { t } = await setupWithStaff();
    await configureGoogle();
    googleFetch([]);
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    await asUser(t, STAFF).mutation(api.calendar.updateEntry, { id, ...entry({ notes: "Bring tape" }) });
    await asUser(t, STAFF).mutation(api.calendar.removeEntry, { id });
    expect((await scheduledSyncs(t)).map((f) => [f.name, f.args[0]])).toEqual([
      ["googleCalendar:syncEntry", { entryId: id }],
      ["googleCalendar:syncEntry", { entryId: id }],
      ["googleCalendar:syncEntry", { entryId: id }],
    ]);
  });
});

describe("googleCalendar for entries", () => {
  test("pushes an entry with its notes and a link to its day, and removes it once deleted", async () => {
    const { t } = await setupWithStaff();
    const id = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry({ notes: "Print 200" }));
    const unconfigured = googleFetch([]);
    await t.action(internal.googleCalendar.syncEntry, { entryId: id });
    expect(unconfigured).toHaveLength(0);

    await configureGoogle();
    let calls = googleFetch([200]);
    await t.action(internal.googleCalendar.syncEntry, { entryId: id });
    expect(calls[0]).toMatchObject({ method: "PUT", body: { summary: "Camp posters due", colorId: "1" } });
    expect(String(calls[0].body!.description)).toContain("Print 200");
    expect(String(calls[0].body!.description)).toContain("/calendar?day=");

    await t.run((ctx) => ctx.db.delete("calendarEntries", id));
    calls = googleFetch([204]);
    await t.action(internal.googleCalendar.syncEntry, { entryId: id });
    expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
  });

  test("a deadline goes to Google as an all-day event", async () => {
    const { t } = await setupWithStaff();
    const id = await asUser(t, STAFF).mutation(
      api.calendar.addEntry,
      entry({ dateStart: NOW + 3 * DAY, dateEnd: NOW + 3 * DAY, due: "day" })
    );
    await configureGoogle();
    const calls = googleFetch([200]);
    await t.action(internal.googleCalendar.syncEntry, { entryId: id });
    expect(calls[0].body).toMatchObject({ summary: "Camp posters due", start: { date: expect.any(String) } });
    expect(calls[0].body).not.toHaveProperty("start.dateTime");
  });

  test("the backfill includes entries", async () => {
    const { t } = await setupWithStaff();
    await create(t, { name: "Stall" });
    await asUser(t, STAFF).mutation(api.calendar.addEntry, entry());
    await configureGoogle();
    const calls = googleFetch([]);
    expect(await t.action(internal.googleCalendar.backfill, { daysBack: 1 })).toEqual({ synced: 2 });
    expect(calls.map((c) => c.body!.summary).sort()).toEqual(["Camp posters due", "Stall"]);
  });
});

describe("googleCalendar.createSharedCalendar", () => {
  const args = { name: "SOW Events", domain: "sow.org.au" };

  test("needs the service account", async () => {
    const { t } = await setup();
    await expect(t.action(internal.googleCalendar.createSharedCalendar, args)).rejects.toThrow(
      "Set GOOGLE_SA_CLIENT_EMAIL"
    );
  });

  test("makes the calendar and shares it with everyone at the domain", async () => {
    const { t } = await setup();
    await configureGoogle();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        calls.push({ url: String(url), body: JSON.parse(String(init!.body)) });
        return new Response(JSON.stringify({ id: "abc@group.calendar.google.com" }), { status: 200 });
      })
    );
    expect(await t.action(internal.googleCalendar.createSharedCalendar, args)).toEqual({
      calendarId: "abc@group.calendar.google.com",
      addLink: `https://calendar.google.com/calendar/u/0?cid=${btoa("abc@group.calendar.google.com")}`,
    });
    expect(calls[0]).toMatchObject({ body: { summary: "SOW Events", timeZone: "Australia/Sydney" } });
    expect(calls[1]).toMatchObject({
      url: "https://www.googleapis.com/calendar/v3/calendars/abc%40group.calendar.google.com/acl",
      body: { role: "reader", scope: { type: "domain", value: "sow.org.au" } },
    });
  });

  test("reports Google refusing to create or share it", async () => {
    const { t } = await setup();
    await configureGoogle();
    for (const [statuses, message] of [
      [[403], "Google Calendar create failed: 403"],
      [[200, 400], "Calendar abc was made but isn't shared"],
    ] as const) {
      const queue = [...statuses];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL) =>
          String(url).includes("oauth2")
            ? new Response(JSON.stringify({ access_token: "token" }), { status: 200 })
            : new Response(JSON.stringify({ id: "abc" }), { status: queue.shift() })
        )
      );
      await expect(t.action(internal.googleCalendar.createSharedCalendar, args)).rejects.toThrow(message);
    }
  });
});

describe("review follow-ups", () => {
  test("events that ended before the month can't fill the cap", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 500; i++) {
        await ctx.db.insert("events", { name: `Old ${i}`, subgroups: ["SOW"], ...at(-20 + i / 1000, 1) });
      }
    });
    const id = await create(t, { name: "This month" });
    const rows = await asUser(t, ADMIN).query(api.calendar.range, { from: NOW, to: NOW + 10 * DAY });
    expect(rows!.map((r) => r.id)).toEqual([id]);
  });

  test("an edit during a Google write is written straight after, so Google ends up with the newest", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Old name" });
    await configureGoogle();
    const puts: string[] = [];
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        puts.push(JSON.parse(String(init!.body)).summary);
        if (first) {
          first = false;
          // While this write is in flight, the event changes and a second sync starts.
          await t.run((ctx) => ctx.db.patch("events", eventId, { name: "New name" }));
          await t.action(internal.googleCalendar.syncEvent, { eventId });
        }
        return new Response("{}", { status: 200 });
      })
    );
    await t.action(internal.googleCalendar.syncEvent, { eventId });
    expect(puts).toEqual(["Old name", "New name"]);
    expect(await t.run((ctx) => ctx.db.query("googleSyncLocks").collect())).toHaveLength(0);
  });

  test("a failed write frees its lock, and a lock left behind expires", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Stall" });
    await configureGoogle();
    googleFetch([500]);
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow("update failed");
    expect(await t.run((ctx) => ctx.db.query("googleSyncLocks").collect())).toHaveLength(0);

    const claim = () => t.mutation(internal.googleCalendar.claimSync, { targetId: "x" });
    const finish = (owner: string, failed = false) =>
      t.mutation(internal.googleCalendar.finishSync, { targetId: "x", owner, failed });
    expect(await finish("nobody")).toBe(false);
    const slow = (await claim())!;
    expect(await claim()).toBeNull();
    // The slow writer's lock expires and a new writer takes over.
    vi.setSystemTime(NOW + 2 * 60_000);
    const fresh = (await claim())!;
    expect(fresh).not.toBe(slow);
    // The slow writer finishing late leaves the new owner's lock alone.
    expect(await finish(slow)).toBe(false);
    expect(await claim()).toBeNull();
    // Pending, but the write failed: the lock goes rather than looping.
    expect(await finish(fresh, true)).toBe(false);
    expect(await t.run((ctx) => ctx.db.query("googleSyncLocks").collect())).toHaveLength(0);
  });

  test("the backfill pages through more than one page", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 130; i++) {
        await ctx.db.insert("events", { name: `E${i}`, subgroups: ["SOW"], ...at(1 + i / 100) });
      }
    });
    await configureGoogle();
    googleFetch([]);
    expect(await t.action(internal.googleCalendar.backfill, { daysBack: 1 })).toEqual({ synced: 130 });
  });
});

describe("regression fixes", () => {
  test("a failed write is tried again later, with whatever changed meanwhile", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Old name" });
    await configureGoogle();
    const puts: string[] = [];
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
        }
        puts.push(JSON.parse(String(init!.body)).summary);
        if (first) {
          first = false;
          await t.run((ctx) => ctx.db.patch("events", eventId, { name: "New name" }));
          await t.action(internal.googleCalendar.syncEvent, { eventId });
          return new Response("busy", { status: 503 });
        }
        return new Response("{}", { status: 200 });
      })
    );
    const before = Date.now();
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId })).rejects.toThrow(
      "update failed: 503"
    );
    const retries = await scheduledSyncs(t);
    expect(retries.map((f) => f.args[0])).toEqual([
      { eventId, attempt: 1 },
      { eventId, attempt: 1 },
    ]);
    for (const retry of retries) {
      expect(retry.scheduledTime - before).toBeGreaterThanOrEqual(60_000);
      expect(retry.scheduledTime - before).toBeLessThan(70_000);
    }
    await t.action(internal.googleCalendar.syncEvent, { eventId, attempt: 1 });
    expect(puts).toEqual(["Old name", "New name"]);
    expect(await t.run((ctx) => ctx.db.query("googleSyncLocks").collect())).toHaveLength(0);
  });

  test("waits 5 minutes before the second retry and 30 before the third", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Stall" });
    await configureGoogle();
    for (const [attempt, delay] of [
      [1, 5 * 60_000],
      [2, 30 * 60_000],
    ] as const) {
      googleFetch([500]);
      const before = Date.now();
      await expect(t.action(internal.googleCalendar.syncEvent, { eventId, attempt })).rejects.toThrow(
        "update failed"
      );
      const retry = (await scheduledSyncs(t)).find(
        (f) => (f.args[0] as { attempt: number }).attempt === attempt + 1
      )!;
      expect(retry.scheduledTime - before).toBeGreaterThanOrEqual(delay);
      expect(retry.scheduledTime - before).toBeLessThan(delay + 10_000);
    }
  });

  test("Google's error is still reported when its retry can't be scheduled", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Stall" });
    await configureGoogle();
    googleFetch([500]);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      t.action(internal.googleCalendar.syncEvent, { eventId, attempt: 0.5 })
    ).rejects.toThrow("update failed: 500");
    expect(logged).toHaveBeenCalledWith("Could not schedule a Google Calendar retry", expect.any(Error));
    expect(await scheduledSyncs(t)).toHaveLength(0);
    logged.mockRestore();
  });

  test("gives up after three more tries, for entries too", async () => {
    const { t } = await setupWithStaff();
    const eventId = await create(t, { name: "Stall" });
    const entryId = await asUser(t, STAFF).mutation(api.calendar.addEntry, entry({}));
    await configureGoogle();
    googleFetch([500]);
    await expect(t.action(internal.googleCalendar.syncEvent, { eventId, attempt: 3 })).rejects.toThrow(
      "update failed"
    );
    expect(await scheduledSyncs(t)).toHaveLength(0);
    googleFetch([500]);
    await expect(t.action(internal.googleCalendar.syncEntry, { entryId, attempt: 2 })).rejects.toThrow(
      "update failed"
    );
    expect((await scheduledSyncs(t)).map((f) => [f.name, f.args[0]])).toEqual([
      ["googleCalendar:syncEntry", { entryId, attempt: 3 }],
    ]);
  });
});
