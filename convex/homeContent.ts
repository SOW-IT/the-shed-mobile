import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { homeBlockValidator } from "./homeData";
import { DEFAULT_TEAMS } from "../shared/teams";
import { personaInDepartment } from "../shared/actingAs";
import { lensFor, personaIsAdmin } from "./actingAs";
import { teamsFor } from "./teamJobs";
import { displayName, divisionsHeadedBy, isAdminProfile, optionalProfile, type CallerContext } from "./model";
import {
  canEditHomeProfile,
  DEFAULT_HOME_BLOCKS,
  HOME_TABS,
  HomeContentError,
  isHomeTabKey,
  sanitizeHomeBlocks,
  type HomeBlock,
  type HomeTabKey,
} from "../shared/homeContent";

const tabViewValidator = v.object({
  key: v.string(),
  label: v.string(),
  blocks: v.array(homeBlockValidator),
  revision: v.number(),
  edited: v.union(
    v.object({ at: v.number(), by: v.string() }),
    v.null()
  ),
});

async function canEdit(ctx: QueryCtx | MutationCtx, caller: CallerContext | null) {
  if (!caller) return false;
  const { profile, year, email } = caller;
  const headed = (await divisionsHeadedBy(ctx, year, email)).map((d) => d.name);
  const designTeam = (await teamsFor(ctx, year)).design;
  return canEditHomeProfile(profile, await isAdminProfile(ctx, profile), headed, designTeam);
}

// An admin acting as a role gets the editor only if that role could edit Home.
async function showsEditor(ctx: QueryCtx, caller: CallerContext | null) {
  if (!caller || !(await canEdit(ctx, caller))) return false;
  const lens = await lensFor(ctx, caller);
  if (lens.kind !== "as") return true;
  const teams = await teamsFor(ctx, caller.year);
  return personaIsAdmin(lens.persona, teams) || personaInDepartment(lens.persona, teams.design, teams);
}

async function requireHomeEditor(ctx: MutationCtx): Promise<CallerContext> {
  const caller = await optionalProfile(ctx);
  if (!(await canEdit(ctx, caller))) {
    const designTeam = caller ? (await teamsFor(ctx, caller.year)).design : DEFAULT_TEAMS.design;
    throw new ConvexError(
      `Only admins, ${designTeam} staff and the head of Engagement can edit the Home tab.`
    );
  }
  return caller!;
}

const tabDoc = (ctx: QueryCtx | MutationCtx, key: HomeTabKey) =>
  ctx.db
    .query("homeTabs")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

const parseTab = (tab: string): HomeTabKey => {
  if (!isHomeTabKey(tab)) throw new ConvexError(`Unknown Home tab “${tab}”.`);
  return tab;
};

export const view = query({
  args: {},
  returns: v.object({ canEdit: v.boolean(), tabs: v.array(tabViewValidator) }),
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    const editor = await showsEditor(ctx, caller);
    const tabs = await Promise.all(
      HOME_TABS.map(async ({ key, label }) => {
        const doc = await tabDoc(ctx, key);
        return {
          key,
          label,
          blocks: doc?.blocks ?? DEFAULT_HOME_BLOCKS[key],
          revision: doc?.revision ?? 0,
          edited:
            editor && doc?.blocks
              ? { at: doc.updatedAt, by: await displayName(ctx, doc.updatedBy, caller!.year) }
              : null,
        };
      })
    );
    return { canEdit: editor, tabs };
  },
});

export const save = mutation({
  args: {
    tab: v.string(),
    blocks: v.array(homeBlockValidator),
    baseRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireHomeEditor(ctx);
    const key = parseTab(args.tab);
    let blocks;
    try {
      blocks = sanitizeHomeBlocks(args.blocks);
    } catch (e) {
      throw e instanceof HomeContentError ? new ConvexError(e.message) : e;
    }
    await writeTab(ctx, key, blocks, caller.email, args.baseRevision);
    return null;
  },
});

export const reset = mutation({
  args: { tab: v.string(), baseRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireHomeEditor(ctx);
    await writeTab(ctx, parseTab(args.tab), null, caller.email, args.baseRevision);
    return null;
  },
});

async function writeTab(
  ctx: MutationCtx,
  key: HomeTabKey,
  blocks: HomeBlock[] | null,
  email: string,
  baseRevision: number
) {
  const existing = await tabDoc(ctx, key);
  if ((existing?.revision ?? 0) !== baseRevision) {
    throw new ConvexError(
      "Someone else saved this tab while you were editing. Close the editor and open it again to see their changes."
    );
  }
  if (!existing && blocks === null) return;
  const row = {
    key,
    blocks,
    revision: (existing?.revision ?? 0) + 1,
    updatedAt: Date.now(),
    updatedBy: email,
  };
  if (existing) await ctx.db.replace("homeTabs", existing._id, row);
  else await ctx.db.insert("homeTabs", row);
}
