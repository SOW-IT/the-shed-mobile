import { type MetadataFieldLike, resolveUniversity } from "../shared/attendanceMemberMeta";
import {
  type CampusCategory,
  insightsRoleOf,
  markedRoleIn,
  memberRole,
} from "../shared/memberRole";
import { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

const MAX_CAMPUSES = 100;

/** Each person's category in every campus's latest term, from last night's
 *  Insights build, keyed as the sign-in screen keys them (`member:…`). */
export async function categoriesByPerson(ctx: QueryCtx): Promise<Map<string, CampusCategory[]>> {
  const byPerson = new Map<string, CampusCategory[]>();
  for (const row of await ctx.db.query("weeklyCategories").take(MAX_CAMPUSES)) {
    for (const { key, category } of row.people) {
      const seen = byPerson.get(key) ?? [];
      seen.push({ subgroup: row.subgroup, category });
      byPerson.set(key, seen);
    }
  }
  return byPerson;
}

/** Works out a plain member's Role (shared/memberRole.ts), reading last
 *  night's categories once for a whole list. `automatic` is the Role they'd
 *  have without a hand-set one. */
export async function memberRoleResolver(ctx: QueryCtx, fields: readonly MetadataFieldLike[]) {
  const categories = await categoriesByPerson(ctx);
  return (member: Pick<Doc<"attendanceMembers">, "_id" | "metadata">) => {
    const marked = markedRoleIn(fields, member.metadata);
    const insights = insightsRoleOf(
      categories.get(`member:${member._id}`) ?? [],
      resolveUniversity(fields, member.metadata)
    );
    return { ...memberRole({ marked, insights }), marked, automatic: memberRole({ insights }) };
  };
}
