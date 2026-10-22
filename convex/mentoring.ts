import { ConvexError, v } from "convex/values";
import {
  campusLeaderLine,
  cleanExternalMentor,
  externalMentorError,
  isCampusLeaderProfile,
  nameKey,
  pairingsText,
  profileLine,
} from "../shared/mentoring";
import type { RoleTitles } from "../shared/flow";
import { Doc, Id } from "./_generated/dataModel";
import { mutation, query, QueryCtx } from "./_generated/server";
import {
  assertManagedYear,
  currentStaffYear,
  findProfileForYear,
  nextStaffYear,
  optionalEmail,
  requireAdmin,
  roleTitlesForYear,
} from "./model";
import { photoFor } from "./photo";

export const MENTORING_LIMIT = 500;

const PROFILE_LIMIT = 1000;

const isEditableYear = (year: number) =>
  year === currentStaffYear() || year === nextStaffYear();

const mentorValidator = v.union(
  v.object({ kind: v.literal("leader"), email: v.string() }),
  v.object({ kind: v.literal("external"), id: v.id("externalMentors") })
);

const externalFields = {
  name: v.string(),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  notes: v.optional(v.string()),
};

async function personName(
  ctx: QueryCtx,
  email: string,
  profile: Doc<"staffProfiles"> | null
): Promise<string> {
  if (profile?.name) return profile.name;
  const directoryUser = await ctx.db
    .query("directoryUsers")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (directoryUser?.name) return directoryUser.name;
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return user?.name?.trim() || email;
}

async function personCard(ctx: QueryCtx, email: string, year: number) {
  const profile = await findProfileForYear(ctx, email, year);
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .first();
  return {
    email,
    name: await personName(ctx, email, profile),
    photo: await photoFor(ctx, user, email),
    profile,
  };
}

const memo = <T>(load: (key: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    let hit = cache.get(key);
    if (!hit) {
      hit = load(key);
      cache.set(key, hit);
    }
    return hit;
  };
};

type CardFor = (email: string) => ReturnType<typeof personCard>;

const menteeWarning = (profile: Doc<"staffProfiles"> | null): string | null => {
  if (!profile) return "No longer a leader";
  return isCampusLeaderProfile(profile) ? null : "No longer a Campus leader";
};

const leaderMentorWarning = (profile: Doc<"staffProfiles"> | null): string | null => {
  if (!profile) return "Mentor is no longer a leader";
  return isCampusLeaderProfile(profile) ? "Mentor is now a Campus leader" : null;
};

async function mentorOf(
  ctx: QueryCtx,
  row: Doc<"mentorships">,
  warn: boolean,
  cardFor: CardFor,
  titles: RoleTitles
) {
  if (row.externalMentorId) {
    const external = await ctx.db.get("externalMentors", row.externalMentorId);
    return {
      kind: "external" as const,
      id: row.externalMentorId,
      email: external?.email ?? null,
      name: external?.name ?? "Deleted external mentor",
      photo: null,
      line: external?.email ?? external?.phone ?? null,
      warning: null,
    };
  }
  const email = row.mentorEmail ?? "";
  const card = await cardFor(email);
  return {
    kind: "leader" as const,
    id: null,
    email,
    name: card.name,
    photo: card.photo,
    line: card.profile ? profileLine(card.profile, titles) : null,
    warning: warn ? leaderMentorWarning(card.profile) : null,
  };
}

export const pairings = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const editable = isEditableYear(args.year);
    const rows = await ctx.db
      .query("mentorships")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(MENTORING_LIMIT);
    const cardFor = memo((email) => personCard(ctx, email, args.year));
    const titles = await roleTitlesForYear(ctx, args.year);
    const editorName = memo(async (email) =>
      personName(ctx, email, await findProfileForYear(ctx, email, currentStaffYear()))
    );
    const pairs = await Promise.all(
      rows.map(async (row) => {
        const mentee = await cardFor(row.menteeEmail);
        return {
          id: row._id,
          mentee: {
            email: mentee.email,
            name: mentee.name,
            photo: mentee.photo,
            line: mentee.profile ? campusLeaderLine(mentee.profile, titles) : null,
            warning: editable ? menteeWarning(mentee.profile) : null,
          },
          mentor: await mentorOf(ctx, row, editable, cardFor, titles),
          imported: row.legacyKey !== undefined,
          updatedAt: row.updatedAt,
          updatedBy: row.legacyKey !== undefined ? null : await editorName(row.updatedBy),
        };
      })
    );
    pairs.sort((a, b) => a.mentee.name.localeCompare(b.mentee.name));
    return { year: args.year, editable, pairs };
  },
});

export const candidates = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const profiles = await ctx.db
      .query("staffProfiles")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(PROFILE_LIMIT);
    const pairs = await ctx.db
      .query("mentorships")
      .withIndex("by_year", (q) => q.eq("year", args.year))
      .take(MENTORING_LIMIT);
    const externals = await ctx.db.query("externalMentors").take(MENTORING_LIMIT);
    const titles = await roleTitlesForYear(ctx, args.year);
    const externalNames = new Map(externals.map((e) => [e._id as string, e.name]));
    const names = new Map<string, string>();
    for (const profile of profiles) {
      names.set(profile.email, await personName(ctx, profile.email, profile));
    }
    const mentorNameByMentee = new Map<string, string>();
    for (const pair of pairs) {
      const mentorName = pair.externalMentorId
        ? (externalNames.get(pair.externalMentorId) ?? "an external mentor")
        : (names.get(pair.mentorEmail ?? "") ?? pair.mentorEmail ?? "");
      mentorNameByMentee.set(pair.menteeEmail, mentorName);
    }
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
    const campusLeaders = profiles
      .filter(isCampusLeaderProfile)
      .map((profile) => ({
        email: profile.email,
        name: names.get(profile.email) ?? profile.email,
        line: campusLeaderLine(profile, titles),
        mentoredBy: mentorNameByMentee.get(profile.email) ?? null,
      }))
      .sort(byName);
    const leaders = profiles
      .filter((profile) => !isCampusLeaderProfile(profile))
      .map((profile) => ({
        email: profile.email,
        name: names.get(profile.email) ?? profile.email,
        line: profileLine(profile, titles),
      }))
      .sort(byName);
    return {
      campusLeaders,
      leaders,
      externals: externals
        .map((e) => ({ id: e._id, name: e.name, email: e.email ?? null }))
        .sort(byName),
    };
  },
});

export const externalMentors = query({
  args: {},
  handler: async (ctx) => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const rows = await ctx.db.query("externalMentors").take(MENTORING_LIMIT);
    const mentors = await Promise.all(
      rows.map(async (row) => {
        const used = await ctx.db
          .query("mentorships")
          .withIndex("by_externalMentorId", (q) => q.eq("externalMentorId", row._id))
          .take(MENTORING_LIMIT);
        return {
          id: row._id,
          name: row.name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          notes: row.notes ?? null,
          pairingCount: used.length,
          years: [...new Set(used.map((p) => p.year))].sort((a, b) => b - a),
        };
      })
    );
    return mentors.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myMentees = query({
  args: {},
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (email === null) return null;
    const year = currentStaffYear();
    const rows = await ctx.db
      .query("mentorships")
      .withIndex("by_mentorEmail_and_year", (q) => q.eq("mentorEmail", email).eq("year", year))
      .take(MENTORING_LIMIT);
    const titles = await roleTitlesForYear(ctx, year);
    const mentees = await Promise.all(
      rows.map(async (row) => {
        const card = await personCard(ctx, row.menteeEmail, year);
        return {
          id: row._id,
          email: card.email,
          name: card.name,
          photo: card.photo,
          line: card.profile ? campusLeaderLine(card.profile, titles) : null,
        };
      })
    );
    mentees.sort((a, b) => a.name.localeCompare(b.name));
    return { year, mentees };
  },
});

export const setMentor = mutation({
  args: { year: v.number(), menteeEmail: v.string(), mentor: mentorValidator },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    assertManagedYear(args.year);
    const mentee = await findProfileForYear(ctx, args.menteeEmail.trim().toLowerCase(), args.year);
    if (!mentee || !isCampusLeaderProfile(mentee)) {
      throw new ConvexError(`${args.menteeEmail} isn't a Campus leader in ${args.year}.`);
    }
    let mentorEmail: string | undefined;
    let externalMentorId: Id<"externalMentors"> | undefined;
    if (args.mentor.kind === "leader") {
      const mentor = await findProfileForYear(ctx, args.mentor.email.trim().toLowerCase(), args.year);
      if (!mentor) {
        throw new ConvexError(
          `${args.mentor.email} has no profile for ${args.year}. Add them as an external mentor instead.`
        );
      }
      if (isCampusLeaderProfile(mentor)) {
        throw new ConvexError("Campus leaders can't mentor other Campus leaders.");
      }
      mentorEmail = mentor.email;
    } else {
      if (!(await ctx.db.get("externalMentors", args.mentor.id))) {
        throw new ConvexError("That external mentor was deleted.");
      }
      externalMentorId = args.mentor.id;
    }
    const fields = {
      mentorEmail,
      externalMentorId,
      updatedBy: caller.email,
      updatedAt: Date.now(),
      legacyKey: undefined,
    };
    const existing = await ctx.db
      .query("mentorships")
      .withIndex("by_menteeEmail_and_year", (q) =>
        q.eq("menteeEmail", mentee.email).eq("year", args.year)
      )
      .unique();
    if (existing) {
      await ctx.db.patch("mentorships", existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("mentorships", {
      year: args.year,
      menteeEmail: mentee.email,
      ...fields,
    });
  },
});

export const removePairing = mutation({
  args: { id: v.id("mentorships") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get("mentorships", args.id);
    if (!row) return null;
    assertManagedYear(row.year);
    await ctx.db.delete("mentorships", args.id);
    return null;
  },
});

export const saveExternalMentor = mutation({
  args: { id: v.optional(v.id("externalMentors")), ...externalFields },
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const draft = {
      name: args.name,
      email: args.email ?? "",
      phone: args.phone ?? "",
      notes: args.notes ?? "",
    };
    const problem = externalMentorError(draft);
    if (problem) throw new ConvexError(problem);
    const clean = cleanExternalMentor(draft);
    if (clean.email) {
      const sameEmail = await ctx.db
        .query("externalMentors")
        .withIndex("by_email", (q) => q.eq("email", clean.email))
        .first();
      if (sameEmail && sameEmail._id !== args.id) {
        throw new ConvexError(`${sameEmail.name} already uses ${clean.email}.`);
      }
    }
    const fields = {
      ...clean,
      nameKey: nameKey(clean.name),
      updatedBy: caller.email,
      updatedAt: Date.now(),
    };
    if (args.id) {
      if (!(await ctx.db.get("externalMentors", args.id))) {
        throw new ConvexError("That external mentor was deleted.");
      }
      await ctx.db.patch("externalMentors", args.id, fields);
      return args.id;
    }
    return await ctx.db.insert("externalMentors", fields);
  },
});

export const removeExternalMentor = mutation({
  args: { id: v.id("externalMentors") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const external = await ctx.db.get("externalMentors", args.id);
    if (!external) return null;
    const used = await ctx.db
      .query("mentorships")
      .withIndex("by_externalMentorId", (q) => q.eq("externalMentorId", args.id))
      .take(MENTORING_LIMIT);
    if (used.length > 0) {
      throw new ConvexError(
        `${external.name} is in ${pairingsText(used.length)}, so they can't be deleted.`
      );
    }
    await ctx.db.delete("externalMentors", args.id);
    return null;
  },
});
