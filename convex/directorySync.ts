import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  MutationCtx,
  query,
} from "./_generated/server";
import {
  previousStaffYearByEmailKey,
  previousStaffYearForEmail,
  staffEmailCandidates,
} from "../shared/rollcallImport";
import { optionalEmail, requireAdmin } from "./model";

const SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
const DIRECTORY_LIMIT = 10000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const base64urlToBytes = (data: string): Uint8Array => {
  const normalised = data
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[*.=]/g, "");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const encodeJson = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const privateKeyPem = process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonate = process.env.GOOGLE_ADMIN_IMPERSONATE;
  if (!clientEmail || !privateKeyPem || !impersonate) {
    throw new Error(
      "Directory sync is not configured: set GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY and GOOGLE_ADMIN_IMPERSONATE."
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: clientEmail,
    sub: impersonate,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${await response.text()}`);
  }
  const { access_token } = (await response.json()) as { access_token: string };
  return access_token;
}

async function fetchPhoto(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">> } },
  token: string,
  email: string
): Promise<Id<"_storage"> | null> {
  const response = await fetch(
    `https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(
      email
    )}/photos/thumbnail`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `Directory photo API error for ${email}: ${response.status} ${await response.text()}`
    );
  }
  const photo = (await response.json()) as {
    photoData?: string;
    mimeType?: string;
  };
  if (!photo.photoData) return null;
  const blob = new Blob([base64urlToBytes(photo.photoData).buffer as ArrayBuffer], {
    type: photo.mimeType ?? "image/jpeg",
  });
  return await ctx.storage.store(blob);
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const domain = process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";
    type DirUser = { email: string; name?: string; photoEtag?: string };
    let users: DirUser[] = [];
    const uploadedThisRun: Id<"_storage">[] = [];
    try {
      const token = await getAccessToken();
      let pageToken: string | undefined;
      do {
        const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
        url.searchParams.set("domain", domain);
        url.searchParams.set("maxResults", "500");
        url.searchParams.set("orderBy", "email");
        url.searchParams.set("projection", "full");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Directory API error: ${await response.text()}`);
        }
        const page = (await response.json()) as {
          users?: {
            primaryEmail?: string;
            suspended?: boolean;
            name?: { fullName?: string };
            thumbnailPhotoEtag?: string;
          }[];
          nextPageToken?: string;
        };
        users = users.concat(
          (page.users ?? [])
            .filter((u) => u.primaryEmail && !u.suspended)
            .map((u) => ({
              email: u.primaryEmail!.toLowerCase(),
              name: u.name?.fullName,
              photoEtag: u.thumbnailPhotoEtag,
            }))
        );
        pageToken = page.nextPageToken;
      } while (pageToken);

      const cache = await ctx.runQuery(internal.directorySync.photoSyncState, {});
      const staffEmails = new Set(cache.staffEmails);
      const cachedByEmail = new Map(
        cache.photos.map((p) => [p.email, p] as const)
      );
      const stalePhotoIds: Id<"_storage">[] = [];
      const resolved: {
        email: string;
        name?: string;
        photoId?: Id<"_storage">;
        photoEtag?: string;
      }[] = [];
      for (const user of users) {
        const cached = cachedByEmail.get(user.email);
        const wantsPhoto = staffEmails.has(user.email) && !!user.photoEtag;
        if (!wantsPhoto) {
          if (cached?.photoId) stalePhotoIds.push(cached.photoId);
          resolved.push({ email: user.email, name: user.name });
          continue;
        }
        if (cached?.photoId && cached.photoEtag === user.photoEtag) {
          resolved.push({
            email: user.email,
            name: user.name,
            photoId: cached.photoId,
            photoEtag: cached.photoEtag,
          });
          continue;
        }
        const photoId = await fetchPhoto(ctx, token, user.email);
        if (photoId) {
          uploadedThisRun.push(photoId);
          if (cached?.photoId) stalePhotoIds.push(cached.photoId);
          resolved.push({
            email: user.email,
            name: user.name,
            photoId,
            photoEtag: user.photoEtag,
          });
        } else {
          resolved.push({
            email: user.email,
            name: user.name,
            photoId: cached?.photoId,
            photoEtag: cached?.photoEtag,
          });
        }
      }
      await ctx.runMutation(internal.directorySync.store, {
        users: resolved,
        stalePhotoIds,
      });
    } catch (error) {
      console.error("Directory sync failed:", error);
      for (const id of uploadedThisRun) {
        await ctx.storage.delete(id);
      }
      await ctx.runMutation(internal.directorySync.recordFailure, {
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    return null;
  },
});

type PhotoSyncState = {
  photos: {
    email: string;
    photoId?: Id<"_storage">;
    photoEtag?: string;
  }[];
  staffEmails: string[];
};
export const photoSyncState = internalQuery({
  args: {},
  handler: async (ctx): Promise<PhotoSyncState> => {
    const existing = await ctx.db.query("directoryUsers").take(DIRECTORY_LIMIT);
    const profiles = await ctx.db.query("staffProfiles").take(DIRECTORY_LIMIT);
    return {
      photos: existing.map((u) => ({
        email: u.email,
        photoId: u.photoId,
        photoEtag: u.photoEtag,
      })),
      staffEmails: [...new Set(profiles.map((p) => p.email))],
    };
  },
});

const upsertSyncState = async (ctx: MutationCtx, detail: string) => {
  const existing = await ctx.db
    .query("syncState")
    .withIndex("by_key", (q) => q.eq("key", "directory"))
    .unique();
  if (existing) {
    await ctx.db.patch("syncState", existing._id, { at: Date.now(), detail });
  } else {
    await ctx.db.insert("syncState", { key: "directory", at: Date.now(), detail });
  }
};

export const store = internalMutation({
  args: {
    users: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        photoId: v.optional(v.id("_storage")),
        photoEtag: v.optional(v.string()),
      })
    ),
    stalePhotoIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("directoryUsers").take(DIRECTORY_LIMIT);
    const byEmail = new Map(existing.map((u) => [u.email, u]));

    for (const user of args.users) {
      const current = byEmail.get(user.email);
      if (current) {
        if (
          current.name !== user.name ||
          current.photoId !== user.photoId ||
          current.photoEtag !== user.photoEtag
        ) {
          await ctx.db.patch("directoryUsers", current._id, {
            name: user.name,
            photoId: user.photoId,
            photoEtag: user.photoEtag,
          });
        }
        byEmail.delete(user.email);
      } else {
        await ctx.db.insert("directoryUsers", user);
      }
    }
    for (const [, gone] of byEmail) {
      if (gone.photoId) await ctx.storage.delete(gone.photoId);
      await ctx.db.delete("directoryUsers", gone._id);
    }
    for (const stale of args.stalePhotoIds ?? []) {
      await ctx.storage.delete(stale);
    }

    await upsertSyncState(ctx, `synced ${args.users.length} people`);
    return null;
  },
});

export const recordFailure = internalMutation({
  args: { detail: v.string() },
  handler: async (ctx, args) => {
    await upsertSyncState(ctx, `failed: ${args.detail}`);
    return null;
  },
});

export const requestSync = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.directorySync.run, {});
    return null;
  },
});

export const list = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", "directory"))
      .unique();
    const users = await ctx.db.query("directoryUsers").take(DIRECTORY_LIMIT);
    const profiles = await ctx.db.query("staffProfiles").take(DIRECTORY_LIMIT);
    const currentKeys = new Set<string>();
    for (const profile of profiles) {
      if (profile.year !== args.year) continue;
      for (const key of staffEmailCandidates(profile.email)) currentKeys.add(key);
    }
    const previousByEmail = previousStaffYearByEmailKey(profiles, args.year);
    const annotated = [];
    for (const user of users) {
      const keys = staffEmailCandidates(user.email);
      annotated.push({
        email: user.email,
        name: user.name ?? null,
        hasProfile: keys.some((key) => currentKeys.has(key)),
        previousYear: previousStaffYearForEmail(previousByEmail, user.email) ?? null,
      });
    }
    return {
      syncedAt: state?.at ?? null,
      status: state?.detail ?? null,
      users: annotated,
    };
  },
});
