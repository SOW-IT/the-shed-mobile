import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { DIRECTOR } from "../shared/flow";
import type { Teams } from "../shared/teams";
import { teamsFor } from "./teamJobs";
import {
  chosenAdmin,
  Ctx,
  currentStaffYear,
  displayName,
  isAdminProfile,
  isFixedAdminIn,
  optionalProfile,
  requireAdmin,
  rolesOf,
} from "./model";
import type { Doc } from "./_generated/dataModel";
import { isCampusLeaderProfile } from "../shared/mentoring";

const MAX_CHOSEN_ADMINS = 50;
const MAX_STORED_ROWS = 200;
const MAX_PROFILES = 3000;
const STALE = "Someone else changed the admins while you were editing. Check the list and try again.";

const normalEmail = (email: string) => email.trim().toLowerCase();

const thisYearsProfiles = (ctx: Ctx) =>
  ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", currentStaffYear()))
    .take(MAX_PROFILES);

const chosenRows = (ctx: Ctx) => ctx.db.query("admins").take(MAX_STORED_ROWS);

const fixedReason = (teams: Teams, profile: Doc<"staffProfiles">) =>
  rolesOf(profile).includes(DIRECTOR) ? "Director" : teams.admin;

const nameOf = (profile: Doc<"staffProfiles">) => profile.name ?? profile.email;

const byName = <T extends { name: string }>(rows: T[]) =>
  rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

export const list = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      fixed: v.array(v.object({ email: v.string(), name: v.string(), reason: v.string() })),
      chosen: v.array(v.object({ email: v.string(), name: v.string(), onStaff: v.boolean() })),
      staff: v.array(v.object({ email: v.string(), name: v.string() })),
    })
  ),
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller || !(await isAdminProfile(ctx, caller.profile))) return null;
    const profiles = await thisYearsProfiles(ctx);
    const teams = await teamsFor(ctx, currentStaffYear());
    const profileByEmail = new Map(profiles.map((p) => [normalEmail(p.email), p]));
    const fixed = profiles.filter((p) => isFixedAdminIn(teams, p));
    const fixedEmails = new Set(fixed.map((p) => normalEmail(p.email)));
    const chosen = (await chosenRows(ctx)).filter((row) => !fixedEmails.has(row.email));
    return {
      fixed: byName(fixed.map((p) => ({ email: p.email, name: nameOf(p), reason: fixedReason(teams, p) }))),
      chosen: byName(
        await Promise.all(
          chosen.map(async (row) => {
            const profile = profileByEmail.get(row.email);
            return {
              email: row.email,
              name: profile ? nameOf(profile) : await displayName(ctx, row.email, caller.year),
              onStaff: profile !== undefined,
            };
          })
        )
      ),
      staff: byName(
        profiles
          .filter((p) => !fixedEmails.has(normalEmail(p.email)) && !isCampusLeaderProfile(p))
          .map((p) => ({ email: normalEmail(p.email), name: nameOf(p) }))
      ),
    };
  },
});

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

export const set = mutation({
  args: { emails: v.array(v.string()), expected: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const caller = await requireAdmin(ctx);
    const wanted = [...new Set(args.emails.map(normalEmail).filter(Boolean))];
    if (wanted.length > MAX_CHOSEN_ADMINS) {
      throw new ConvexError(`There can be at most ${MAX_CHOSEN_ADMINS} chosen admins.`);
    }
    const profileList = await thisYearsProfiles(ctx);
    const profiles = new Map(profileList.map((p) => [normalEmail(p.email), p]));
    const teams = await teamsFor(ctx, currentStaffYear());
    const fixedEmails = new Set(
      profileList.filter((p) => isFixedAdminIn(teams, p)).map((p) => normalEmail(p.email))
    );
    const rows = (await chosenRows(ctx)).filter((row) => !fixedEmails.has(row.email));
    if (!sameSet(rows.map((row) => row.email), [...new Set(args.expected.map(normalEmail))])) {
      throw new ConvexError(STALE);
    }
    const current = new Set(rows.map((row) => row.email));
    for (const email of wanted) {
      if (current.has(email)) continue;
      const profile = profiles.get(email);
      if (!profile) throw new ConvexError(`${email} has no role in ${currentStaffYear()}, so they can't be an admin.`);
      if (isCampusLeaderProfile(profile)) {
        throw new ConvexError(`${nameOf(profile)} is a campus leader, so they can't be an admin.`);
      }
    }
    for (const row of rows) {
      if (!wanted.includes(row.email)) await ctx.db.delete("admins", row._id);
    }
    const now = Date.now();
    for (const email of wanted) {
      if (!current.has(email)) await ctx.db.insert("admins", { email, addedBy: caller.email, addedAt: now });
    }
    return null;
  },
});

export const add = internalMutation({
  args: { email: v.string(), addedBy: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normalEmail(args.email);
    if (await chosenAdmin(ctx, email)) return null;
    if ((await chosenRows(ctx)).length >= MAX_CHOSEN_ADMINS) {
      throw new ConvexError(`There can be at most ${MAX_CHOSEN_ADMINS} chosen admins.`);
    }
    await ctx.db.insert("admins", { email, addedBy: args.addedBy, addedAt: Date.now() });
    return null;
  },
});
