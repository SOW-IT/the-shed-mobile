import { v } from "convex/values";
import type { WeeklyCategory } from "../shared/weeklyInsights";
import { internalMutation, type MutationCtx } from "./_generated/server";

const MAX_CAMPUSES = 100;
const MAX_PEOPLE_PER_CAMPUS = 4000;

type Person = { key: string; category: WeeklyCategory };

const pairKey = (key: string, category: string) => `${key}\n${category}`;

async function syncSubgroup(ctx: MutationCtx, subgroup: string, people: readonly Person[]) {
  const wanted = new Map<string, Person>();
  for (const person of people) {
    if (person.key.startsWith("member:")) wanted.set(pairKey(person.key, person.category), person);
  }
  const saved = await ctx.db
    .query("weeklyCategoryPeople")
    .withIndex("by_subgroup", (q) => q.eq("subgroup", subgroup))
    .take(MAX_PEOPLE_PER_CAMPUS);
  for (const row of saved) {
    if (!wanted.delete(pairKey(row.key, row.category))) await ctx.db.delete("weeklyCategoryPeople", row._id);
  }
  for (const { key, category } of wanted.values()) {
    await ctx.db.insert("weeklyCategoryPeople", { subgroup, key, category });
  }
}

async function syncAll(ctx: MutationCtx) {
  const docs = await ctx.db.query("weeklyCategories").take(MAX_CAMPUSES);
  for (const doc of docs) await syncSubgroup(ctx, doc.subgroup, doc.people);
  const campuses = new Set(docs.map((doc) => doc.subgroup));
  for await (const row of ctx.db.query("weeklyCategoryPeople")) {
    if (!campuses.has(row.subgroup)) await ctx.db.delete("weeklyCategoryPeople", row._id);
  }
  return docs.length;
}

export async function syncCategoryPeople(ctx: MutationCtx, subgroup: string, people: readonly Person[]) {
  if (await ctx.db.query("weeklyCategoryPeople").first()) await syncSubgroup(ctx, subgroup, people);
  else await syncAll(ctx);
}

export const backfill = internalMutation({
  args: {},
  returns: v.object({ campuses: v.number() }),
  handler: async (ctx) => ({ campuses: await syncAll(ctx) }),
});
