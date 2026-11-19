import { paginationOptsValidator } from "convex/server";
import { staffYearForDate } from "../shared/flow";
import { type AuditedEntry, type CalendarAuditAction, type EntryChange, entryWhen } from "../shared/calendarAudit";
import { Id } from "./_generated/dataModel";
import { MutationCtx, query } from "./_generated/server";
import { viewsAsAdmin } from "./actingAs";
import { displayName, memoAsync, optionalProfile } from "./model";

export async function logCalendarAction(
  ctx: MutationCtx,
  actorEmail: string,
  action: CalendarAuditAction,
  entryId: Id<"calendarEntries">,
  entry: AuditedEntry,
  extra: { changes?: EntryChange[]; eventId?: Id<"events"> } = {}
): Promise<void> {
  await ctx.db.insert("calendarAuditLog", {
    actorEmail,
    action,
    entryId,
    name: entry.name,
    when: entryWhen(entry),
    ...extra,
  });
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const caller = await optionalProfile(ctx);
    if (!(await viewsAsAdmin(ctx, caller))) return null;
    const result = await ctx.db.query("calendarAuditLog").order("desc").paginate(paginationOpts);
    const year = staffYearForDate(new Date());
    const nameOf = memoAsync((email: string) => displayName(ctx, email, year));
    const page = await Promise.all(
      result.page.map(async (row) => ({
        id: row._id,
        at: row._creationTime,
        actorEmail: row.actorEmail,
        actorName: await nameOf(row.actorEmail),
        action: row.action,
        name: row.name,
        when: row.when,
        changes: row.changes ?? [],
        eventId: row.eventId ?? null,
      }))
    );
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
