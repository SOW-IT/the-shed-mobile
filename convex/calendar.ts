import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { calendarCategoryOf } from "../shared/calendar";
import { normalizeSubgroups } from "../shared/rollcall";
import { optionalProfile } from "./model";

const RANGE_LIMIT = 500;
const LONGEST_EVENT_MS = 31 * 86_400_000;

export const range = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    if (!(await optionalProfile(ctx))) return null;
    const events = await ctx.db
      .query("events")
      .withIndex("by_dateStart", (q) =>
        q.gte("dateStart", from - LONGEST_EVENT_MS).lt("dateStart", to)
      )
      .take(RANGE_LIMIT);
    const tags = new Map((await ctx.db.query("attendanceTags").take(500)).map((t) => [t._id, t]));
    return events
      .filter((event) => event.dateEnd >= from)
      .map((event) => {
        const eventTags = (event.tagIds ?? []).flatMap((id) => {
          const tag = tags.get(id);
          return tag ? [tag] : [];
        });
        return {
          _id: event._id,
          name: event.name,
          dateStart: event.dateStart,
          dateEnd: event.dateEnd,
          subgroups: normalizeSubgroups(event.subgroups),
          category: calendarCategoryOf(event, eventTags),
          tags: eventTags.map((tag: Doc<"attendanceTags">) => ({ name: tag.name, colour: tag.colour })),
        };
      });
  },
});
