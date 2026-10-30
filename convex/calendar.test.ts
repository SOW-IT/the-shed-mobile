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
    await create(t, { name: "Camp posters due", category: "deadline", ...at(2) });
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
      ["Camp posters due", "deadline"],
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

describe("events keep their calendar category", () => {
  test("update sets, keeps and clears it, and says so in the audit log", async () => {
    const { t } = await setup();
    const eventId = await create(t, { name: "Reel shoot", category: "marketing" });
    const base = { eventId, name: "Reel shoot", subgroups: [USYD], ...at(1) };
    await asUser(t, ADMIN).mutation(api.events.update, base);
    expect((await t.run((ctx) => ctx.db.get("events", eventId)))!.category).toBe("marketing");
    await asUser(t, ADMIN).mutation(api.events.update, { ...base, category: "other" });
    expect((await t.run((ctx) => ctx.db.get("events", eventId)))!.category).toBe("other");
    await asUser(t, ADMIN).mutation(api.events.update, { ...base, category: null });
    expect((await t.run((ctx) => ctx.db.get("events", eventId)))!.category).toBeUndefined();
    const audit = await t.run((ctx) => ctx.db.query("attendanceAuditLog").collect());
    expect(audit.filter((a) => a.action === "event.update").map((a) => a.detail)).toEqual([
      "Changed: calendar category",
      "Changed: calendar category",
    ]);
  });

  test("changes are queued for Google only once a calendar is set up", async () => {
    const { t } = await setup();
    const first = await create(t, { name: "Before setup" });
    expect(await scheduledSyncs(t)).toHaveLength(0);

    await configureGoogle();
    googleFetch([]);
    const eventId = await create(t, { name: "After setup" });
    await asUser(t, ADMIN).mutation(api.events.update, {
      eventId,
      name: "After setup (moved)",
      subgroups: [USYD],
      ...at(2),
    });
    await asUser(t, ADMIN).mutation(api.events.remove, { eventId: first });
    expect((await scheduledSyncs(t)).map((f) => f.args[0])).toEqual([
      { eventId },
      { eventId },
      { eventId: first },
    ]);
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
