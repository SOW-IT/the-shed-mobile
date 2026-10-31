import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalAction, internalQuery, QueryCtx } from "./_generated/server";
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
const BACKFILL_LIMIT = 1000;
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

export const bodiesFrom = internalQuery({
  args: { from: v.number() },
  handler: async (ctx, { from }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from))
      .take(BACKFILL_LIMIT);
    const entries = await ctx.db
      .query("calendarEntries")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from))
      .take(BACKFILL_LIMIT);
    return [
      ...(await Promise.all(
        events.map(async (event) => ({ id: event._id as string, body: await eventBodyFor(ctx, event) }))
      )),
      ...entries.map((entry) => ({ id: entry._id as string, body: entryBodyFor(entry) })),
    ];
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

async function sync(id: string, body: GoogleBody | null) {
  const token = await googleAccessToken(EVENTS_SCOPE);
  if (body) await push(token, id, body);
  else await remove(token, id);
}

export const syncEvent = internalAction({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    if (!calendarSyncConfigured()) return null;
    const body: GoogleBody | null = await ctx.runQuery(internal.googleCalendar.eventBody, {
      eventId,
    });
    await sync(eventId, body);
    return null;
  },
});

export const syncEntry = internalAction({
  args: { entryId: v.id("calendarEntries") },
  handler: async (ctx, { entryId }) => {
    if (!calendarSyncConfigured()) return null;
    const body: GoogleBody | null = await ctx.runQuery(internal.googleCalendar.entryBody, {
      entryId,
    });
    await sync(entryId, body);
    return null;
  },
});

// Copies events and entries from `daysBack` days ago onwards; safe to run again.
// npx convex run googleCalendar:backfill '{"daysBack": 90}'
export const backfill = internalAction({
  args: { daysBack: v.number() },
  handler: async (ctx, { daysBack }) => {
    if (!calendarSyncConfigured()) {
      throw new Error("Set GOOGLE_CALENDAR_ID (and the service account) first.");
    }
    const rows: { id: string; body: GoogleBody }[] = await ctx.runQuery(
      internal.googleCalendar.bodiesFrom,
      { from: Date.now() - daysBack * DAY_MS }
    );
    const token = await googleAccessToken(EVENTS_SCOPE);
    for (const row of rows) await push(token, row.id, row.body);
    return { synced: rows.length };
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
    if (!shared.ok) await fail(shared, "share");
    return { calendarId: id, addLink: `https://calendar.google.com/calendar/u/0?cid=${btoa(id)}` };
  },
});
