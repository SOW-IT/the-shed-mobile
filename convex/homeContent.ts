import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { homeBlockValidator } from "./homeData";
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
  return canEditHomeProfile(profile, await isAdminProfile(ctx, profile), headed);
}

async function requireHomeEditor(ctx: MutationCtx): Promise<CallerContext> {
  const caller = await optionalProfile(ctx);
  if (!(await canEdit(ctx, caller))) {
    throw new ConvexError(
      "Only admins, Marketing staff and the head of Engagement can edit the Home tab."
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

/**
 * Home's sub-tabs and their blocks. A tab nobody has edited shows the default
 * content; editors also see who last changed each tab.
 */
export const view = query({
  args: {},
  returns: v.object({ canEdit: v.boolean(), tabs: v.array(tabViewValidator) }),
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    const editor = await canEdit(ctx, caller);
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

/**
 * Replaces one tab's blocks. `baseRevision` is the revision the editor's copy
 * came from, so two people editing at once can't silently overwrite each other.
 */
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
    const existing = await tabDoc(ctx, key);
    if ((existing?.revision ?? 0) !== args.baseRevision) {
      throw new ConvexError(
        "Someone else saved this tab while you were editing. Close the editor and open it again to see their changes."
      );
    }
    await writeTab(ctx, key, blocks, caller.email);
    return null;
  },
});

/**
 * Puts a tab back to the default content. The row stays (with null blocks) so
 * its revision keeps counting up and older copies stay out of date.
 */
export const reset = mutation({
  args: { tab: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireHomeEditor(ctx);
    const key = parseTab(args.tab);
    if (await tabDoc(ctx, key)) await writeTab(ctx, key, null, caller.email);
    return null;
  },
});

async function writeTab(
  ctx: MutationCtx,
  key: HomeTabKey,
  blocks: HomeBlock[] | null,
  email: string
) {
  const existing = await tabDoc(ctx, key);
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
