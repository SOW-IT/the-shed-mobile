import { ConvexError, type Infer, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { compareVersions, isAppVersion, updateStatusFor } from "../shared/appLinks";
import { Ctx, optionalEmail } from "./model";

const platformValidator = v.union(v.literal("ios"), v.literal("android"));

export const report = mutation({
  args: { platform: platformValidator, version: v.string() },
  handler: async (ctx, args) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    if (!isAppVersion(args.version)) throw new ConvexError("That isn't an app version.");
    const existing = await ctx.db
      .query("appInstalls")
      .withIndex("by_email_and_platform", (q) =>
        q.eq("email", email).eq("platform", args.platform)
      )
      .unique();
    const seenAt = Date.now();
    if (existing) {
      await ctx.db.patch("appInstalls", existing._id, { version: args.version, seenAt });
    } else {
      await ctx.db.insert("appInstalls", { email, ...args, seenAt });
    }
    return null;
  },
});

const policyFor = (ctx: Ctx, platform: Infer<typeof platformValidator>) =>
  ctx.db
    .query("appUpdatePolicy")
    .withIndex("by_platform", (q) => q.eq("platform", platform))
    .unique();

const newestOf = (...versions: (string | undefined)[]): string | null =>
  versions
    .filter((version): version is string => !!version)
    .reduce<string | null>(
      (newest, version) => (newest && compareVersions(newest, version) >= 0 ? newest : version),
      null
    );

export const updateStatus = query({
  args: { platform: platformValidator, version: v.string(), ota: v.optional(v.literal(true)) },
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("recommended"), v.literal("required")),
    latest: v.union(v.string(), v.null()),
    message: v.union(v.string(), v.null()),
    storeVersion: v.optional(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, { platform, version, ota }) => {
    const policy = await policyFor(ctx, platform);
    const storeVersion = newestOf(policy?.recommended, policy?.minimum);
    const message = policy?.message ?? null;
    if (!ota) return { status: updateStatusFor(version, policy), latest: storeVersion, message };
    const recommended = newestOf(policy?.recommended, policy?.latestOta) ?? undefined;
    return {
      status: updateStatusFor(version, policy && { minimum: policy.minimum, recommended }),
      latest: newestOf(recommended, policy?.minimum),
      message,
      storeVersion,
    };
  },
});

export const setUpdatePolicy = internalMutation({
  args: {
    platform: platformValidator,
    minimum: v.optional(v.union(v.string(), v.null())),
    recommended: v.optional(v.union(v.string(), v.null())),
    latestOta: v.optional(v.union(v.string(), v.null())),
    message: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    minimum: v.union(v.string(), v.null()),
    recommended: v.union(v.string(), v.null()),
    latestOta: v.union(v.string(), v.null()),
    message: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { platform, minimum, recommended, latestOta, message }) => {
    for (const value of [minimum, recommended, latestOta]) {
      if (value && !isAppVersion(value)) throw new ConvexError(`"${value}" isn't an app version like 2.9.0.`);
    }
    const existing = await policyFor(ctx, platform);
    const next = {
      minimum: (minimum === undefined ? existing?.minimum : minimum) ?? undefined,
      recommended: (recommended === undefined ? existing?.recommended : recommended) ?? undefined,
      latestOta: (latestOta === undefined ? existing?.latestOta : latestOta) ?? undefined,
      message: (message === undefined ? existing?.message : message?.trim() || null) ?? undefined,
    };
    if (existing) await ctx.db.replace("appUpdatePolicy", existing._id, { platform, ...next });
    else await ctx.db.insert("appUpdatePolicy", { platform, ...next });
    return {
      minimum: next.minimum ?? null,
      recommended: next.recommended ?? null,
      latestOta: next.latestOta ?? null,
      message: next.message ?? null,
    };
  },
});

export const raiseLatestOta = internalMutation({
  args: { platform: platformValidator, version: v.string() },
  returns: v.object({
    raised: v.boolean(),
    previous: v.union(v.string(), v.null()),
    latestOta: v.string(),
  }),
  handler: async (ctx, { platform, version }) => {
    if (!isAppVersion(version)) throw new ConvexError(`"${version}" isn't an app version like 2.9.0.`);
    const existing = await policyFor(ctx, platform);
    const previous = existing?.latestOta ?? null;
    if (previous && compareVersions(version, previous) <= 0) return { raised: false, previous, latestOta: previous };
    if (existing) await ctx.db.patch("appUpdatePolicy", existing._id, { latestOta: version });
    else await ctx.db.insert("appUpdatePolicy", { platform, latestOta: version });
    return { raised: true, previous, latestOta: version };
  },
});
