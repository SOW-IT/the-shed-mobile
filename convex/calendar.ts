import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { calendarCategoryOf, entryProblem, normalizeEntry } from "../shared/calendar";
import { eventStaffYear } from "../shared/flow";
import { normalizeSubgroups, SOW_SUBGROUP } from "../shared/rollcall";
import { entryFields } from "./calendarData";
import { calendarSyncConfigured } from "./googleCalendar";
import { isAdminProfile, optionalProfile, requireProfile, type CallerContext } from "./model";

const RANGE_LIMIT = 500;
const LONGEST_EVENT_MS = 31 * 86_400_000;

type Ctx = QueryCtx | MutationCtx;

async function validSubgroups(ctx: Ctx, dateStart: number): Promise<string[]> {
  const universities = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", eventStaffYear(dateStart)))
    .collect();
  return [SOW_SUBGROUP, ...universities.map((u) => u.name)];
}

const canEditEntry = async (ctx: Ctx, caller: CallerContext, entry: Doc<"calendarEntries">) =>
  entry.createdBy === caller.email || (await isAdminProfile(ctx, caller.profile));

async function checkedEntry(ctx: Ctx, args: Omit<Doc<"calendarEntries">, "_id" | "_creationTime" | "createdBy">) {
  const entry = normalizeEntry(args);
  const problem = entryProblem(entry, await validSubgroups(ctx, entry.dateStart));
  if (problem) throw new ConvexError(problem);
  return entry;
}

async function requireEditableEntry(ctx: MutationCtx, id: Id<"calendarEntries">) {
  const caller = await requireProfile(ctx);
  const entry = await ctx.db.get("calendarEntries", id);
  if (!entry) throw new ConvexError("That calendar entry no longer exists.");
  if (!(await canEditEntry(ctx, caller, entry))) {
    throw new ConvexError("Only whoever added it, or an admin, can change this entry.");
  }
  return entry;
}

async function syncEntry(ctx: MutationCtx, entryId: Id<"calendarEntries">) {
  if (calendarSyncConfigured()) {
    await ctx.scheduler.runAfter(0, internal.googleCalendar.syncEntry, { entryId });
  }
}

export const addEntry = mutation({
  args: entryFields,
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const id = await ctx.db.insert("calendarEntries", {
      ...(await checkedEntry(ctx, args)),
      createdBy: caller.email,
    });
    await syncEntry(ctx, id);
    return id;
  },
});

export const updateEntry = mutation({
  args: { id: v.id("calendarEntries"), ...entryFields },
  handler: async (ctx, { id, ...args }) => {
    await requireEditableEntry(ctx, id);
    await ctx.db.patch("calendarEntries", id, await checkedEntry(ctx, args));
    await syncEntry(ctx, id);
    return null;
  },
});

export const removeEntry = mutation({
  args: { id: v.id("calendarEntries") },
  handler: async (ctx, { id }) => {
    await requireEditableEntry(ctx, id);
    await ctx.db.delete("calendarEntries", id);
    await syncEntry(ctx, id);
    return null;
  },
});

// Every attendance event and calendar entry that touches the window.
export const range = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    // Skip ones that ended before the window as they're read, so they can't fill the cap.
    const events: Doc<"events">[] = [];
    for await (const event of ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from - LONGEST_EVENT_MS).lt("dateStart", to))) {
      if (event.dateEnd < from) continue;
      events.push(event);
      if (events.length >= RANGE_LIMIT) break;
    }
    const entries: Doc<"calendarEntries">[] = [];
    for await (const entry of ctx.db
      .query("calendarEntries")
      .withIndex("by_dateStart", (q) => q.gte("dateStart", from - LONGEST_EVENT_MS).lt("dateStart", to))) {
      if (entry.dateEnd < from) continue;
      entries.push(entry);
      if (entries.length >= RANGE_LIMIT) break;
    }
    const tagIds = [...new Set(events.flatMap((event) => event.tagIds ?? []))];
    const tags = new Map(
      (await Promise.all(tagIds.map((id) => ctx.db.get(id)))).flatMap((tag) =>
        tag ? [[tag._id, tag] as const] : []
      )
    );
    const isAdmin = await isAdminProfile(ctx, caller.profile);
    const fromEvents = events.map((event) => {
      const eventTags = (event.tagIds ?? []).flatMap((id) => {
        const tag = tags.get(id);
        return tag ? [tag] : [];
      });
      return {
        kind: "attendance" as const,
        id: event._id as string,
        name: event.name,
        dateStart: event.dateStart,
        dateEnd: event.dateEnd,
        subgroups: normalizeSubgroups(event.subgroups),
        category: calendarCategoryOf(event, eventTags),
        tags: eventTags.map((tag) => ({ name: tag.name, colour: tag.colour })),
        notes: null,
        canEdit: false,
      };
    });
    const fromEntries = entries.map((entry) => ({
      kind: "entry" as const,
      id: entry._id as string,
      name: entry.name,
      dateStart: entry.dateStart,
      dateEnd: entry.dateEnd,
      subgroups: normalizeSubgroups(entry.subgroups),
      category: entry.category,
      tags: [],
      notes: entry.notes ?? null,
      canEdit: isAdmin || entry.createdBy === caller.email,
    }));
    return [...fromEvents, ...fromEntries];
  },
});
