import { type MetadataFieldLike, resolveUniversity } from "../shared/attendanceMemberMeta";
import {
  type CampusCategory,
  insightsRoleOf,
  markedRoleIn,
  memberRole,
} from "../shared/memberRole";
import { canonicalSubgroup, isOrgWideSubgroup, normalizeSubgroups } from "../shared/rollcall";
import { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const MAX_CAMPUSES = 100;

export const eventCampuses = (subgroups: string[]): string[] | undefined => {
  const normalized = normalizeSubgroups(subgroups);
  if (normalized.length === 0 || normalized.some(isOrgWideSubgroup)) return undefined;
  return normalized.map(canonicalSubgroup);
};

const categoryRows = async (ctx: QueryCtx, campuses: readonly string[] | undefined) =>
  campuses
    ? await Promise.all(
        campuses.map((campus) =>
          ctx.db
            .query("weeklyCategories")
            .withIndex("by_subgroup", (q) => q.eq("subgroup", campus))
            .first()
        )
      )
    : await ctx.db.query("weeklyCategories").take(MAX_CAMPUSES);

export async function categoriesByPerson(
  ctx: QueryCtx,
  campuses?: readonly string[]
): Promise<Map<string, CampusCategory[]>> {
  const byPerson = new Map<string, CampusCategory[]>();
  for (const row of await categoryRows(ctx, campuses)) {
    if (!row) continue;
    for (const { key, category } of row.people) {
      const seen = byPerson.get(key) ?? [];
      seen.push({ subgroup: row.subgroup, category });
      byPerson.set(key, seen);
    }
  }
  return byPerson;
}

export async function memberRoleResolver(
  ctx: QueryCtx,
  fields: readonly MetadataFieldLike[],
  campuses?: readonly string[]
) {
  const categories = await categoriesByPerson(ctx, campuses);
  return (member: Pick<Doc<"attendanceMembers">, "_id" | "metadata">) => {
    const marked = markedRoleIn(fields, member.metadata);
    const insights = insightsRoleOf(
      categories.get(`member:${member._id}`) ?? [],
      resolveUniversity(fields, member.metadata)
    );
    return { ...memberRole({ marked, insights }), marked, automatic: memberRole({ insights }) };
  };
}
