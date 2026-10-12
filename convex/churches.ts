import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  query,
  type QueryCtx,
} from "./_generated/server";
import { CAMPUS_FIELD_KEY } from "../shared/attendanceMemberMeta";
import {
  cleanInstagram,
  cleanWebsite,
  formatServices,
  isServiceTime,
  MAX_SERVICES,
  type ServiceTime,
  sortServices,
} from "../shared/churches";
import { assignmentsOf, MEMBER } from "../shared/flow";
import { personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { currentStaffYear, getProfile, optionalEmail, requireProfile, rolesOf } from "./model";

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
  services: ServiceTime[];
  aliases?: string[];
}[] = [
  {
    name: "Living Hope Presbyterian Church",
    services: [
      { day: 0, time: "10:00" },
      { day: 0, time: "12:00" },
    ],
  },
  {
    name: "Harbour City Church",
    address: "41b College Street, Gladesville NSW 2111",
    services: [{ day: 0, time: "10:30" }],
  },
  {
    name: "Sydney Young Nak Church",
    address: "7-9 Manson Street, Telopea NSW",
    services: [{ day: 0, time: "13:15" }],
  },
  {
    name: "Sydney Sae Soon Presbyterian Church (New Life)",
    address: "219A North Rocks Road, North Rocks NSW",
    services: [{ day: 0, time: "10:00" }],
    aliases: [
      "Sydney Saesoon Presbyterian Church",
      "New Life Sydney (Saesoon Presbyterian Church)",
      "Saesoon Presbyterian church, New Life",
    ],
  },
];

const tidy = (text: string | undefined) => text?.trim().replace(/\s+/g, " ") || undefined;
export const churchNameKey = (name: string) => tidy(name)?.toLowerCase() ?? "";

const locationView = v.object({ lat: v.number(), lng: v.number() });
const serviceView = v.object({ day: v.number(), time: v.string() });

export const churchView = v.object({
  _id: v.id("churches"),
  name: v.string(),
  address: v.union(v.string(), v.null()),
  serviceTimes: v.union(v.string(), v.null()),
  services: v.array(serviceView),
  website: v.union(v.string(), v.null()),
  instagram: v.union(v.string(), v.null()),
  location: v.union(locationView, v.null()),
});

export const viewOf = (church: Doc<"churches">) => ({
  _id: church._id,
  name: church.name,
  address: church.address ?? null,
  serviceTimes: formatServices(church.services ?? []) ?? church.serviceTimes ?? null,
  services: church.services ?? [],
  website: church.website ?? null,
  instagram: church.instagram ?? null,
  location: church.location ?? null,
});

const mapsKey = () => process.env.GOOGLE_MAPS_API_KEY || undefined;

const scheduleLocating = async (ctx: MutationCtx) => {
  if (mapsKey()) await ctx.scheduler.runAfter(0, internal.churches.locateAll, {});
};

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
    if (!(await optionalEmail(ctx))) return [];
    const churches = await ctx.db.query("churches").withIndex("by_nameKey").take(MAX_CHURCHES);
    return churches.map(viewOf);
  },
});

const details = {
  name: v.string(),
  address: v.optional(v.string()),
  services: v.optional(v.array(serviceView)),
  website: v.optional(v.string()),
  instagram: v.optional(v.string()),
};

type Details = {
  name: string;
  address?: string;
  services?: ServiceTime[];
  website?: string;
  instagram?: string;
};

function cleanDetails({ name, address, services = [], website, instagram }: Details) {
  if (services.length > MAX_SERVICES) throw new ConvexError(`A church can have up to ${MAX_SERVICES} service times.`);
  if (!services.every(isServiceTime)) throw new ConvexError("Pick a day and a time for each service.");
  const site = cleanWebsite(website);
  if (site === null) throw new ConvexError("That website doesn't look right. Try something like harbourcitychurch.com.");
  const handle = cleanInstagram(instagram);
  if (handle === null) throw new ConvexError("That Instagram doesn't look right. Use the handle, like @harbourcitychurch.");
  const sorted = sortServices(services);
  return {
    name: tidy(name)!,
    nameKey: churchNameKey(name),
    address: tidy(address),
    services: sorted.length ? sorted : undefined,
    serviceTimes: undefined,
    website: site,
    instagram: handle,
  };
}

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
  handler: async (ctx, input) => {
    const { email } = await requireProfile(ctx);
    await checkName(ctx, input.name);
    const church = cleanDetails(input);
    const churchId = await ctx.db.insert("churches", { ...church, addedBy: email });
    if (church.address) await scheduleLocating(ctx);
    return churchId;
  },
});

/** Fixes or fills in a church's name, location or service times. */
export const update = mutation({
  args: { churchId: v.id("churches"), ...details },
  returns: v.null(),
  handler: async (ctx, { churchId, ...input }) => {
    const { email } = await requireProfile(ctx);
    const church = await ctx.db.get("churches", churchId);
    if (!church) throw new ConvexError("That church isn't in the list any more.");
    await checkName(ctx, input.name, churchId);
    const changes = cleanDetails(input);
    const moved = changes.address !== church.address;
    await ctx.db.patch("churches", churchId, {
      ...changes,
      updatedBy: email,
      ...(moved ? { location: undefined, locatedAt: undefined } : {}),
    });
    if (moved && changes.address) await scheduleLocating(ctx);
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
      const existing = await churchByName(ctx, church.name);
      let id = existing?._id;
      if (!id) {
        id = await ctx.db.insert("churches", { ...church, nameKey: churchNameKey(church.name), addedBy: "system" });
        added++;
      } else if (!existing?.services?.length) {
        await ctx.db.patch("churches", id, { services: church.services, serviceTimes: undefined });
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
    if (added) await scheduleLocating(ctx);
    return { added, linked, next: page.isDone ? null : page.continueCursor };
  },
});

/**
 * The Churches page: every church with the staff (who picked it in their
 * Profile) and members (set on their attendance record) who go there.
 */
const LEADER_ROLES = [
  "Director",
  "Head of Division",
  "Head of Department",
  "Staff",
  "Senior Chaplain",
  "Junior Chaplain",
  "Intern Chaplain",
  "President",
  "Vice President",
  "Executive",
  "Student Leader",
  "Outsource",
];

export const roleRank = (role: string) => {
  if (role === MEMBER) return LEADER_ROLES.length + 1;
  const index = LEADER_ROLES.indexOf(role);
  return index === -1 ? LEADER_ROLES.length : index;
};

export const leadingRole = (roles: readonly string[]) =>
  roles
    .filter((role) => role !== MEMBER)
    .sort((a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b))[0] ?? MEMBER;

async function currentProfile(ctx: QueryCtx, email: string | undefined) {
  for (const candidate of staffEmailCandidates(email)) {
    const profile = await getProfile(ctx, candidate, currentStaffYear());
    if (profile) return profile;
  }
  return null;
}

async function signedInUser(ctx: QueryCtx, email: string | undefined) {
  for (const candidate of staffEmailCandidates(email)) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", candidate))
      .first();
    if (user) return user;
  }
  return null;
}

const personView = v.object({
  name: v.string(),
  role: v.string(),
  campus: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  memberId: v.union(v.id("attendanceMembers"), v.null()),
});
type Person = typeof personView.type;

const campusOfProfile = (profile: Doc<"staffProfiles">) =>
  assignmentsOf(profile).find((a) => a.university)?.university ?? null;

const leadersFirst = (a: Person, b: Person) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name);

export const directory = query({
  args: {},
  returns: v.array(v.object({ church: churchView, people: v.array(personView), peopleCount: v.number() })),
  handler: async (ctx) => {
    const signedIn = (await optionalEmail(ctx)) !== null;
    const campusField = (await ctx.db.query("attendanceMetadata").take(200)).find(
      (f) => f.key === CAMPUS_FIELD_KEY
    );
    const memberCampus = (member: Doc<"attendanceMembers">) => {
      const raw = campusField ? member.metadata?.[campusField._id] : undefined;
      const campus = raw ? (campusField?.values?.[raw] ?? raw) : null;
      return campus && campus !== "Other" ? campus : null;
    };
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
      const people: Person[] = [];
      for (const user of users) {
        if (!user.email) continue;
        const profile = await currentProfile(ctx, user.email);
        people.push({
          name: personDisplayName(user.name, user.email) || user.email,
          role: profile ? leadingRole(rolesOf(profile)) : MEMBER,
          campus: profile ? campusOfProfile(profile) : null,
          email: user.email,
          memberId: null,
        });
      }
      for (const member of members) {
        const profile = await currentProfile(ctx, member.email);
        if (profile && (await signedInUser(ctx, member.email))?.churchId) continue;
        people.push({
          name: profile?.name ?? member.name,
          role: profile ? leadingRole(rolesOf(profile)) : MEMBER,
          campus: (profile && campusOfProfile(profile)) ?? memberCampus(member),
          email: profile?.email ?? null,
          memberId: member._id,
        });
      }
      people.sort(leadersFirst);
      out.push({ church: viewOf(church), people: signedIn ? people : [], peopleCount: people.length });
    }
    return out;
  },
});

const LOCATION_MAX_AGE_MS = 25 * 24 * 60 * 60 * 1000;

type Located = { lat: number; lng: number };

export const needingLocation = internalQuery({
  args: { now: v.number() },
  returns: v.array(v.object({ churchId: v.id("churches"), address: v.string() })),
  handler: async (ctx, { now }) => {
    const churches = await ctx.db.query("churches").take(MAX_CHURCHES);
    return churches
      .filter((c) => c.address && (c.locatedAt === undefined || now - c.locatedAt > LOCATION_MAX_AGE_MS))
      .map((c) => ({ churchId: c._id, address: c.address! }));
  },
});

export const saveLocation = internalMutation({
  args: { churchId: v.id("churches"), address: v.string(), location: v.union(locationView, v.null()) },
  returns: v.null(),
  handler: async (ctx, { churchId, address, location }) => {
    const church = await ctx.db.get("churches", churchId);
    if (church?.address !== address) return null;
    await ctx.db.patch("churches", churchId, { location: location ?? undefined, locatedAt: Date.now() });
    return null;
  },
});

async function geocode(address: string, key: string): Promise<Located | null> {
  const params = new URLSearchParams({ address, components: "country:AU", key });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
  if (!response.ok) throw new Error(`Geocoding returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    status: string;
    error_message?: string;
    results?: { geometry: { location: Located } }[];
  };
  if (body.status === "ZERO_RESULTS") return null;
  if (body.status !== "OK" || !body.results?.length) {
    throw new Error(`Geocoding returned ${body.status}${body.error_message ? `: ${body.error_message}` : ""}`);
  }
  const { lat, lng } = body.results[0].geometry.location;
  return { lat, lng };
}

export const locateAll = internalAction({
  args: {},
  returns: v.object({ located: v.number(), notFound: v.number(), failed: v.number() }),
  handler: async (ctx) => {
    const tally = { located: 0, notFound: 0, failed: 0 };
    const key = mapsKey();
    if (!key) return tally;
    const todo: { churchId: Id<"churches">; address: string }[] = await ctx.runQuery(
      internal.churches.needingLocation,
      { now: Date.now() }
    );
    for (const { churchId, address } of todo) {
      try {
        const location = await geocode(address, key);
        await ctx.runMutation(internal.churches.saveLocation, { churchId, address, location });
        if (location) tally.located++;
        else tally.notFound++;
      } catch (error) {
        console.error(`Couldn't find "${address}" on the map`, error);
        tally.failed++;
      }
    }
    return tally;
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
