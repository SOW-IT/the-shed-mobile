import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { currentStaffYear, optionalProfile, requireProfile } from "./model";

// Local churches staff go to. Any staff member can add one (with where it is
// and when it meets) or fill in a missing detail; everyone picks theirs from
// the list in their Profile.

const MAX_CHURCHES = 500;
const MAX_USERS = 5000;
const MAX_STAFF = 3000;

/** The churches the list starts with. */
export const STARTER_CHURCHES = [
  { name: "Living Hope Presbyterian Church", serviceTimes: "Sunday 10am and 12pm" },
  {
    name: "Harbour City Church",
    address: "41b College Street, Gladesville NSW 2111",
    serviceTimes: "Sunday 10:30am",
  },
];

const tidy = (text: string | undefined) => text?.trim().replace(/\s+/g, " ") || undefined;
export const churchNameKey = (name: string) => tidy(name)?.toLowerCase() ?? "";

export const churchView = v.object({
  _id: v.id("churches"),
  name: v.string(),
  address: v.union(v.string(), v.null()),
  serviceTimes: v.union(v.string(), v.null()),
});

export const viewOf = (church: Doc<"churches">) => ({
  _id: church._id,
  name: church.name,
  address: church.address ?? null,
  serviceTimes: church.serviceTimes ?? null,
});

export const churchByName = (ctx: QueryCtx, name: string) =>
  ctx.db
    .query("churches")
    .withIndex("by_nameKey", (q) => q.eq("nameKey", churchNameKey(name)))
    .first();

/** Every church, A to Z. */
export const list = query({
  args: {},
  returns: v.array(churchView),
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return [];
    const churches = await ctx.db.query("churches").withIndex("by_nameKey").take(MAX_CHURCHES);
    return churches.map(viewOf);
  },
});

const details = {
  name: v.string(),
  address: v.optional(v.string()),
  serviceTimes: v.optional(v.string()),
};

async function checkName(ctx: MutationCtx, name: string, except?: Id<"churches">) {
  if (!tidy(name)) throw new ConvexError("Add the church's name.");
  const same = await churchByName(ctx, name);
  if (same && same._id !== except) {
    throw new ConvexError(`${same.name} is already in the list. Pick it instead.`);
  }
}

/** Adds a church to the list. */
export const add = mutation({
  args: details,
  returns: v.id("churches"),
  handler: async (ctx, { name, address, serviceTimes }) => {
    const { email } = await requireProfile(ctx);
    await checkName(ctx, name);
    return await ctx.db.insert("churches", {
      name: tidy(name)!,
      nameKey: churchNameKey(name),
      address: tidy(address),
      serviceTimes: tidy(serviceTimes),
      addedBy: email,
    });
  },
});

/** Fixes or fills in a church's name, location or service times. */
export const update = mutation({
  args: { churchId: v.id("churches"), ...details },
  returns: v.null(),
  handler: async (ctx, { churchId, name, address, serviceTimes }) => {
    const { email } = await requireProfile(ctx);
    const church = await ctx.db.get("churches", churchId);
    if (!church) throw new ConvexError("That church isn't in the list any more.");
    await checkName(ctx, name, churchId);
    await ctx.db.patch("churches", churchId, {
      name: tidy(name)!,
      nameKey: churchNameKey(name),
      address: tidy(address),
      serviceTimes: tidy(serviceTimes),
      updatedBy: email,
    });
    return null;
  },
});

/**
 * Starts the list and links what people typed before it existed: adds the
 * starter churches if they're missing, then points everyone whose typed
 * church has the same name as one in the list at it. Safe to run again.
 *
 *   npx convex run --prod churches:setUp '{}'
 */
export const setUp = internalMutation({
  args: {},
  returns: v.object({ added: v.number(), linked: v.number() }),
  handler: async (ctx) => {
    let added = 0;
    for (const church of STARTER_CHURCHES) {
      if (await churchByName(ctx, church.name)) continue;
      await ctx.db.insert("churches", { ...church, nameKey: churchNameKey(church.name), addedBy: "system" });
      added++;
    }
    let linked = 0;
    for (const user of await ctx.db.query("users").take(MAX_USERS)) {
      if (user.churchId || !user.localChurch) continue;
      const church = await churchByName(ctx, user.localChurch);
      if (!church) continue;
      await ctx.db.patch("users", user._id, { churchId: church._id, localChurch: undefined });
      linked++;
    }
    return { added, linked };
  },
});

export const REMINDER = {
  title: "Set your local church",
  body: "Pick your church in your Profile, or add it with where it is and when it meets.",
  url: "/profile",
};

/**
 * Reminds this staff year's staff who haven't picked a church in their
 * Profile: an in-app notification for each, and a push to their devices.
 * Dry run by default, which only counts them.
 *
 *   npx convex run --prod churches:remindToSetChurch '{}'
 *   npx convex run --prod churches:remindToSetChurch '{"dryRun": false}'
 */
export const remindToSetChurch = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({ staff: v.number(), withoutChurch: v.number(), reminded: v.number() }),
  handler: async (ctx, { dryRun = true }) => {
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", currentStaffYear()))
      .take(MAX_STAFF);
    const staff = new Map<string, string>();
    for (const profile of profiles) {
      const key = canonicalEmailKey(profile.email);
      if (key && !staff.has(key)) staff.set(key, profile.email.toLowerCase());
    }
    const remind: string[] = [];
    for (const [key, email] of staff) {
      let hasChurch = false;
      for (const candidate of staffEmailCandidates(key)) {
        const user = await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", candidate))
          .first();
        if (user?.churchId) hasChurch = true;
      }
      if (!hasChurch) remind.push(email);
    }
    if (!dryRun) {
      for (const email of remind) {
        await ctx.db.insert("notifications", {
          userEmail: email,
          title: REMINDER.title,
          body: REMINDER.body,
          url: REMINDER.url,
          read: false,
        });
      }
      if (remind.length) {
        await ctx.scheduler.runAfter(0, internal.push.sendMany, { to: remind, ...REMINDER });
      }
    }
    return { staff: staff.size, withoutChurch: remind.length, reminded: dryRun ? 0 : remind.length };
  },
});
