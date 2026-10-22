import { v } from "convex/values";
import { nameKey } from "../shared/mentoring";
import { Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import { legacyEmail } from "./designRequestImport";
import { findProfileForYear } from "./model";

export const LEGACY_IMPORTER = "legacy-import";

const legacyPersonValidator = v.object({
  uid: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
});

const legacyPairValidator = v.object({
  year: v.number(),
  mentee: legacyPersonValidator,
  mentor: legacyPersonValidator,
});

const realEmail = (email: string) => (email.endsWith("@legacy.invalid") ? undefined : email);

async function externalFor(
  ctx: MutationCtx,
  uid: string,
  email: string | undefined,
  name: string | undefined,
  counts: { externalsCreated: number }
): Promise<Id<"externalMentors">> {
  const legacyKey = `uid/${uid}`;
  const byKey = await ctx.db
    .query("externalMentors")
    .withIndex("by_legacyKey", (q) => q.eq("legacyKey", legacyKey))
    .first();
  if (byKey) return byKey._id;
  if (email) {
    const byEmail = await ctx.db
      .query("externalMentors")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (byEmail) return byEmail._id;
  }
  const shownName = name?.trim() || email || "Unknown mentor (old app)";
  counts.externalsCreated++;
  return await ctx.db.insert("externalMentors", {
    name: shownName,
    nameKey: nameKey(shownName),
    email,
    updatedBy: LEGACY_IMPORTER,
    updatedAt: Date.now(),
    legacyKey,
  });
}

export const importLegacy = internalMutation({
  args: { pairs: v.array(legacyPairValidator) },
  handler: async (ctx, args) => {
    const counts = { inserted: 0, updated: 0, kept: 0, externalsCreated: 0 };
    const skipped: { year: number; uid: string; email: string | null; reason: string }[] = [];
    for (const pair of args.pairs) {
      const legacyKey = `${pair.year}/${pair.mentee.uid}`;
      const menteeAddress = await legacyEmail(ctx, pair.mentee.uid, pair.mentee.email);
      const mentee = await findProfileForYear(ctx, menteeAddress, pair.year);
      if (!mentee) {
        skipped.push({
          year: pair.year,
          uid: pair.mentee.uid,
          email: realEmail(menteeAddress) ?? null,
          reason: `mentee has no ${pair.year} profile`,
        });
        continue;
      }
      const mentorAddress = await legacyEmail(ctx, pair.mentor.uid, pair.mentor.email);
      const mentorProfile = await findProfileForYear(ctx, mentorAddress, pair.year);
      if (mentorProfile?.email === mentee.email) {
        skipped.push({
          year: pair.year,
          uid: pair.mentee.uid,
          email: mentee.email,
          reason: "mentee is their own mentor",
        });
        continue;
      }
      const mentor = mentorProfile
        ? { mentorEmail: mentorProfile.email, externalMentorId: undefined }
        : {
            mentorEmail: undefined,
            externalMentorId: await externalFor(
              ctx,
              pair.mentor.uid,
              realEmail(mentorAddress),
              pair.mentor.name,
              counts
            ),
          };
      const fields = {
        ...mentor,
        updatedBy: LEGACY_IMPORTER,
        updatedAt: Date.now(),
        legacyKey,
      };
      const existing = await ctx.db
        .query("mentorships")
        .withIndex("by_menteeEmail_and_year", (q) =>
          q.eq("menteeEmail", mentee.email).eq("year", pair.year)
        )
        .unique();
      if (existing && existing.legacyKey === undefined) {
        counts.kept++;
      } else if (existing) {
        await ctx.db.patch("mentorships", existing._id, fields);
        counts.updated++;
      } else {
        await ctx.db.insert("mentorships", {
          year: pair.year,
          menteeEmail: mentee.email,
          ...fields,
        });
        counts.inserted++;
      }
    }
    return { ...counts, skipped };
  },
});
