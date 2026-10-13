import { Doc } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";

type PhotoCtx = Pick<QueryCtx, "db" | "storage">;

export async function photoUrl(
  ctx: PhotoCtx,
  user: Doc<"users"> | null | undefined,
  directoryUser: Doc<"directoryUsers"> | null | undefined
): Promise<string | null> {
  for (const storageId of [user?.avatarId, directoryUser?.photoId]) {
    if (!storageId) continue;
    const url = await ctx.storage.getUrl(storageId);
    if (url) return url;
  }
  return user?.image ?? null;
}

export async function photoFor(
  ctx: PhotoCtx,
  user: Doc<"users"> | null | undefined,
  email: string | null | undefined
): Promise<string | null> {
  const directoryUser = email
    ? await ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .first()
    : null;
  return photoUrl(ctx, user, directoryUser);
}
