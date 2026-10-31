import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import {
  ActionCtx,
  internalAction,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import {
  calendarCategoryOf,
  googleEventBody,
  googleEventId,
  sydneyDayKey,
} from "../shared/calendar";
import { googleAccessToken, googleServiceAccountConfigured } from "./googleAuth";
import { appUrl } from "./requests";

const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDARS_SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3";
const BACKFILL_PAGE = 100;
// A write that dies leaves its lock behind; after this long the next one goes ahead.
const LOCK_MS = 60_000;
const DAY_MS = 86_400_000;

// The shared calendar's id: one made by createSharedCalendar below, or any
// calendar shared with the service account with "Make changes to events".
export const calendarSyncConfigured = (): boolean =>
  !!process.env.GOOGLE_CALENDAR_ID && googleServiceAccountConfigured();

type GoogleBody = ReturnType<typeof googleEventBody>;

async function eventBodyFor(ctx: QueryCtx, event: Doc<"events">): Promise<GoogleBody> {
  const tags = (await Promise.all((event.tagIds ?? []).map((id) => ctx.db.get(id)))).filter(
    (tag): tag is Doc<"attendanceTags"> => tag !== null
  );
  return googleEventBody(
    event,
    calendarCategoryOf(event, tags),
    appUrl(`/attendance/event/${event._id}`)
  );
}

const entryBodyFor = (entry: Doc<"calendarEntries">): GoogleBody =>
  googleEventBody(
    entry,
    entry.category,
    appUrl(`/calendar?day=${sydneyDayKey(entry.dateStart)}`),
    entry.notes
  );

export const eventBody = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    return event ? await eventBodyFor(ctx, event) : null;
  },
});

export const entryBody = internalQuery({
  args: { entryId: v.id("calendarEntries") },
  handler: async (ctx, { entryId }) => {
    const entry = await ctx.db.get(entryId);
    return entry ? entryBodyFor(entry) : null;
  },
});

const pageArgs = { from: v.number(), cursor: v.union(v.string(), v.null()) };

export const eventBodiesPage = internalQuery({
  args: pageArgs,
  handler: async (ctx, { from, cursor }) => {
    const page = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from))
      .paginate({ numItems: BACKFILL_PAGE, cursor });
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (event) => ({ id: event._id as string, body: await eventBodyFor(ctx, event) }))
      ),
    };
  },
});

export const entryBodiesPage = internalQuery({
  args: pageArgs,
  handler: async (ctx, { from, cursor }) => {
    const page = await ctx.db
      .query("calendarEntries")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from))
      .paginate({ numItems: BACKFILL_PAGE, cursor });
    return { ...page, page: page.page.map((entry) => ({ id: entry._id as string, body: entryBodyFor(entry) })) };
  },
});

// Taken before a write: returns this writer's token, or null when another
// write holds it (that one is then told to go again).
export const claimSync = internalMutation({
  args: { targetId: v.string() },
  handler: async (ctx, { targetId }) => {
    const now = Date.now();
    const lock = await ctx.db
      .query("googleSyncLocks")
      .withIndex("by_targetId", (q) => q.eq("targetId", targetId))
      .unique();
    if (lock && lock.lockedUntil > now) {
      await ctx.db.patch("googleSyncLocks", lock._id, { pending: true });
      return null;
    }
    const owner = crypto.randomUUID();
    const fields = { owner, lockedUntil: now + LOCK_MS, pending: false };
    if (lock) await ctx.db.patch("googleSyncLocks", lock._id, fields);
    else await ctx.db.insert("googleSyncLocks", { targetId, ...fields });
    return owner;
  },
});

// After a write: true means something changed meanwhile, so write again. A
// writer whose lock expired and was taken over leaves the new owner's alone.
export const finishSync = internalMutation({
  args: { targetId: v.string(), owner: v.string(), failed: v.boolean() },
  handler: async (ctx, { targetId, owner, failed }) => {
    const lock = await ctx.db
      .query("googleSyncLocks")
      .withIndex("by_targetId", (q) => q.eq("targetId", targetId))
      .unique();
    if (!lock || lock.owner !== owner) return false;
    if (lock.pending && !failed) {
      await ctx.db.patch("googleSyncLocks", lock._id, { lockedUntil: Date.now() + LOCK_MS, pending: false });
      return true;
    }
    await ctx.db.delete("googleSyncLocks", lock._id);
    return false;
  },
});

const eventsUrl = () =>
  `${API}/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID as string)}/events`;

async function call(token: string, method: string, url: string, body?: object) {
  return await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function fail(response: Response, what: string): Promise<never> {
  throw new Error(`Google Calendar ${what} failed: ${response.status} ${await response.text()}`);
}

// Update first: it also brings back an event that was deleted earlier.
async function push(token: string, id: string, body: GoogleBody) {
  const updated = await call(token, "PUT", `${eventsUrl()}/${googleEventId(id)}`, body);
  if (updated.ok) return;
  if (updated.status !== 404) await fail(updated, "update");
  const inserted = await call(token, "POST", eventsUrl(), { ...body, id: googleEventId(id) });
  if (!inserted.ok) await fail(inserted, "insert");
}

async function remove(token: string, id: string) {
  const response = await call(token, "DELETE", `${eventsUrl()}/${googleEventId(id)}`);
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    await fail(response, "delete");
  }
}

// One write at a time per id: an edit during a write makes it write again with
// the newest body, so Google always ends up with the latest.
async function sync(ctx: ActionCtx, id: string, read: () => Promise<GoogleBody | null>) {
  const owner: string | null = await ctx.runMutation(internal.googleCalendar.claimSync, { targetId: id });
  if (owner === null) return;
  for (;;) {
    try {
      const body = await read();
      const token = await googleAccessToken(EVENTS_SCOPE);
      if (body) await push(token, id, body);
      else await remove(token, id);
    } catch (error) {
      await ctx.runMutation(internal.googleCalendar.finishSync, { targetId: id, owner, failed: true });
      throw error;
    }
    if (!(await ctx.runMutation(internal.googleCalendar.finishSync, { targetId: id, owner, failed: false }))) {
      return;
    }
  }
}

export const syncEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!calendarSyncConfigured()) return null;
    await sync(ctx, eventId, () => ctx.runQuery(internal.googleCalendar.eventBody, { eventId }));
    return null;
  },
});

export const syncEntry = internalAction({
  args: { entryId: v.id("calendarEntries") },
  handler: async (ctx, { entryId }) => {
    if (!calendarSyncConfigured()) return null;
    await sync(ctx, entryId, () => ctx.runQuery(internal.googleCalendar.entryBody, { entryId }));
    return null;
  },
});

// Copies every event and entry from `daysBack` days ago onwards, a page at a
// time; safe to run again.
// npx convex run googleCalendar:backfill '{"daysBack": 90}'
export const backfill = internalAction({
  args: { daysBack: v.number() },
  handler: async (ctx, { daysBack }) => {
    if (!calendarSyncConfigured()) {
      throw new Error("Set GOOGLE_CALENDAR_ID (and the service account) first.");
    }
    const from = Date.now() - daysBack * DAY_MS;
    const token = await googleAccessToken(EVENTS_SCOPE);
    let synced = 0;
    for (const pageOf of [internal.googleCalendar.eventBodiesPage, internal.googleCalendar.entryBodiesPage]) {
      let cursor: string | null = null;
      for (;;) {
        const result: { page: { id: string; body: GoogleBody }[]; isDone: boolean; continueCursor: string } =
          await ctx.runQuery(pageOf, { from, cursor });
        for (const row of result.page) await push(token, row.id, row.body);
        synced += result.page.length;
        if (result.isDone) break;
        cursor = result.continueCursor;
      }
    }
    return { synced };
  },
});

// Makes a calendar owned by the service account that everyone at `domain` can
// see, and returns its id (for GOOGLE_CALENDAR_ID) and a link to add it.
// npx convex run googleCalendar:createSharedCalendar '{"name": "SOW Events", "domain": "sow.org.au"}'
export const createSharedCalendar = internalAction({
  args: { name: v.string(), domain: v.string() },
  handler: async (_ctx, { name, domain }) => {
    if (!googleServiceAccountConfigured()) {
      throw new Error("Set GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY first.");
    }
    const token = await googleAccessToken(CALENDARS_SCOPE);
    const created = await call(token, "POST", `${API}/calendars`, {
      summary: name,
      description: "SOW's events from THE SHED. Changes made here aren't copied back to the app.",
      timeZone: "Australia/Sydney",
    });
    if (!created.ok) await fail(created, "create");
    const { id } = (await created.json()) as { id: string };
    const shared = await call(token, "POST", `${API}/calendars/${encodeURIComponent(id)}/acl`, {
      role: "reader",
      scope: { type: "domain", value: domain },
    });
    if (!shared.ok) {
      throw new Error(
        `Google Calendar share failed: ${shared.status} ${await shared.text()}. Calendar ${id} was made but isn't shared; share it or delete it before trying again.`
      );
    }
    return { calendarId: id, addLink: `https://calendar.google.com/calendar/u/0?cid=${btoa(id)}` };
  },
});
