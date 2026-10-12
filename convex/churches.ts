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
import { CAMPUS_FIELD_KEY } from "../shared/attendanceMemberMeta";
import { personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { currentStaffYear, optionalProfile, requireProfile } from "./model";

// Local churches staff go to. Any staff member can add one (with where it is
// and when it meets) or fill in a missing detail; everyone picks theirs from
// the list in their Profile.

const MAX_CHURCHES = 500;
const USERS_PAGE = 500;
const MAX_STAFF = 3000;
const MAX_ATTENDEES = 500;

/** The churches the list starts with. `aliases` are other ways people typed
 *  the name before the list existed, so `setUp` links them too. */
export const STARTER_CHURCHES: {
  name: string;
  address?: string;
  serviceTimes: string;
  aliases?: string[];
}[] = [
  { name: "Living Hope Presbyterian Church", serviceTimes: "Sunday 10am and 12pm" },
  {
    name: "Harbour City Church",
    address: "41b College Street, Gladesville NSW 2111",
    serviceTimes: "Sunday 10:30am",
  },
  {
    name: "Sydney Young Nak Church",
    address: "7-9 Manson Street, Telopea NSW",
    serviceTimes: "Sunday 1:15pm",
  },
  {
    name: "Sydney Sae Soon Presbyterian Church (New Life)",
    address: "219A North Rocks Road, North Rocks NSW",
    serviceTimes: "Sunday 10am",
    aliases: [
      "Sydney Saesoon Presbyterian Church",
      "New Life Sydney (Saesoon Presbyterian Church)",
      "Saesoon Presbyterian church, New Life",
    ],
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
 * church has the same name as one in the list at it, a page of users at a
 * time (pass the returned `next` back as `cursor` until it's null). Safe to
 * run again.
 *
 *   npx convex run --prod churches:setUp '{}'
 */
export const setUp = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ added: v.number(), linked: v.number(), next: v.union(v.string(), v.null()) }),
  handler: async (ctx, { cursor }) => {
    let added = 0;
    const aliases = new Map<string, Id<"churches">>();
    for (const { aliases: alsoKnownAs = [], ...church } of STARTER_CHURCHES) {
      let id = (await churchByName(ctx, church.name))?._id;
      if (!id) {
        id = await ctx.db.insert("churches", { ...church, nameKey: churchNameKey(church.name), addedBy: "system" });
        added++;
      }
      for (const alias of alsoKnownAs) aliases.set(churchNameKey(alias), id);
    }
    let linked = 0;
    const page = await ctx.db.query("users").paginate({ numItems: USERS_PAGE, cursor: cursor ?? null });
    for (const user of page.page) {
      if (user.churchId || !user.localChurch) continue;
      const churchId =
        (await churchByName(ctx, user.localChurch))?._id ?? aliases.get(churchNameKey(user.localChurch));
      if (!churchId) continue;
      await ctx.db.patch("users", user._id, { churchId, localChurch: undefined });
      linked++;
    }
    return { added, linked, next: page.isDone ? null : page.continueCursor };
  },
});

/**
 * The Churches page: every church with the staff (who picked it in their
 * Profile) and members (set on their attendance record) who go there.
 */
export const directory = query({
  args: {},
  returns: v.array(
    v.object({
      church: churchView,
      staff: v.array(v.object({ email: v.string(), name: v.string() })),
      members: v.array(
        v.object({ memberId: v.id("attendanceMembers"), name: v.string(), campus: v.union(v.string(), v.null()) })
      ),
    })
  ),
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return [];
    const campusField = (await ctx.db.query("attendanceMetadata").take(200)).find(
      (f) => f.key === CAMPUS_FIELD_KEY
    );
    const churches = await ctx.db.query("churches").withIndex("by_nameKey").take(MAX_CHURCHES);
    const out = [];
    for (const church of churches) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_churchId", (q) => q.eq("churchId", church._id))
        .take(MAX_ATTENDEES);
      const members = await ctx.db
        .query("attendanceMembers")
        .withIndex("by_churchId", (q) => q.eq("churchId", church._id))
        .take(MAX_ATTENDEES);
      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      out.push({
        church: viewOf(church),
        staff: users
          .filter((u) => u.email)
          .map((u) => ({ email: u.email!, name: personDisplayName(u.name, u.email) || u.email! }))
          .sort(byName),
        members: members
          .map((m) => {
            const raw = campusField ? m.metadata?.[campusField._id] : undefined;
            const campus = raw ? (campusField?.values?.[raw] ?? raw) : null;
            return { memberId: m._id, name: m.name, campus: campus && campus !== "Other" ? campus : null };
          })
          .sort(byName),
      });
    }
    return out;
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
