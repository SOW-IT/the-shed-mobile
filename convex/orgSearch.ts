import { v } from "convex/values";
import { assignmentsOf, formatAssignment, type RoleTitles } from "../shared/flow";
import {
  isOrgSearchQuery,
  matchesOrgSearch,
  orgSearchTerms,
  staffProfileSearchText,
} from "../shared/orgChart";
import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { viewsAsAdmin } from "./actingAs";
import { currentStaffYear, nextStaffYear, optionalProfile, roleTitlesForYear } from "./model";
import { photoUrl } from "./photo";

export const ORG_SEARCH_LIMIT = 40;
const ORG_SEARCH_CANDIDATES = 100;
const BACKFILL_BATCH_SIZE = 200;

export const searchAllYears = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!isOrgSearchQuery(args.query)) return { results: [], more: false };
    const terms = orgSearchTerms(args.query);
    const thisYear = currentStaffYear();
    const nextYear = nextStaffYear();
    const canSeeNextYear = await viewsAsAdmin(ctx, await optionalProfile(ctx));
    const visible = (year: number) => year <= thisYear || (canSeeNextYear && year === nextYear);

    const candidates = await ctx.db
      .query("staffProfiles")
      .withSearchIndex("search_text", (q) => q.search("searchText", terms.join(" ")))
      .take(ORG_SEARCH_CANDIDATES);
    const matched = candidates
      .filter(
        (profile) =>
          visible(profile.year) &&
          assignmentsOf(profile).length > 0 &&
          matchesOrgSearch(terms, profile.searchText ?? "")
      )
      .sort((a, b) => b.year - a.year);
    const shown = matched.slice(0, ORG_SEARCH_LIMIT);

    const titlesByYear = new Map<number, RoleTitles>();
    for (const year of new Set(shown.map((profile) => profile.year))) {
      titlesByYear.set(year, await roleTitlesForYear(ctx, year));
    }
    const people = new Map<string, { name: string | null; photo: string | null }>();
    for (const profile of shown) {
      if (people.has(profile.email)) continue;
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", profile.email))
        .first();
      const dir = await ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", profile.email))
        .first();
      people.set(profile.email, {
        name: user?.name ?? dir?.name ?? profile.name ?? null,
        photo: await photoUrl(ctx, user, dir),
      });
    }

    const results = shown
      .map((profile) => {
        const person = people.get(profile.email);
        return {
          year: profile.year,
          email: profile.email,
          name: person?.name ?? null,
          photo: person?.photo ?? null,
          roles: [
            ...new Set(
              assignmentsOf(profile).map((a) => formatAssignment(a, titlesByYear.get(profile.year)))
            ),
          ],
        };
      })
      .sort(
        (a, b) =>
          b.year - a.year || (a.name ?? a.email).localeCompare(b.name ?? b.email)
      );
    return { results, more: matched.length > ORG_SEARCH_LIMIT };
  },
});

export const backfillSearchText = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, { cursor }) => {
    const batch = await ctx.db
      .query("staffProfiles")
      .paginate({ cursor: cursor ?? null, numItems: BACKFILL_BATCH_SIZE });
    let updated = 0;
    for (const profile of batch.page) {
      const searchText = staffProfileSearchText(profile);
      if (profile.searchText === searchText) continue;
      await ctx.db.patch("staffProfiles", profile._id, { searchText });
      updated++;
    }
    if (!batch.isDone) {
      await ctx.scheduler.runAfter(0, internal.orgSearch.backfillSearchText, {
        cursor: batch.continueCursor,
      });
    }
    return { updated };
  },
});
