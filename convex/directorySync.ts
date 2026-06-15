import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  mutation,
  MutationCtx,
  query,
} from "./_generated/server";
import { getProfile, optionalEmail, requireAdmin } from "./model";

/**
 * Google Workspace directory sync via the Admin SDK Directory API, using a
 * service account with domain-wide delegation. Required deployment env vars:
 *   GOOGLE_SA_CLIENT_EMAIL      service account email
 *   GOOGLE_SA_PRIVATE_KEY       service account private key (PEM; \n escaped ok)
 *   GOOGLE_ADMIN_IMPERSONATE    a Workspace admin to act as
 * The synced list powers the admin screen's people picker; it never creates
 * staff profiles by itself — assignment stays an explicit admin action.
 */

const SCOPE = "https://www.googleapis.com/auth/admin.directory.user.readonly";
const DIRECTORY_LIMIT = 10000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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

/** Service-account JWT -> OAuth access token (domain-wide delegation). */
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

/** Fetches every (non-suspended) Workspace user and stores the list. */
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const domain = process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";
    let users: { email: string; name?: string }[] = [];
    try {
      const token = await getAccessToken();
      let pageToken: string | undefined;
      do {
        const url = new URL("https://admin.googleapis.com/admin/directory/v1/users");
        url.searchParams.set("domain", domain);
        url.searchParams.set("maxResults", "500");
        url.searchParams.set("orderBy", "email");
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
          }[];
          nextPageToken?: string;
        };
        users = users.concat(
          (page.users ?? [])
            .filter((u) => u.primaryEmail && !u.suspended)
            .map((u) => ({
              email: u.primaryEmail!.toLowerCase(),
              name: u.name?.fullName,
            }))
        );
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (error) {
      console.error("Directory sync failed:", error);
      await ctx.runMutation(internal.directorySync.recordFailure, {
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    await ctx.runMutation(internal.directorySync.store, { users });
    return null;
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
    users: v.array(v.object({ email: v.string(), name: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    // Upsert synced users and delete any that are no longer in the directory.
    const existing = await ctx.db.query("directoryUsers").take(DIRECTORY_LIMIT);
    const byEmail = new Map(existing.map((u) => [u.email, u]));

    for (const user of args.users) {
      const current = byEmail.get(user.email);
      if (current) {
        if (current.name !== user.name) {
          await ctx.db.patch("directoryUsers", current._id, { name: user.name });
        }
        byEmail.delete(user.email);
      } else {
        await ctx.db.insert("directoryUsers", user);
      }
    }
    // Remove users no longer returned by the Google sync.
    for (const [, gone] of byEmail) {
      await ctx.db.delete("directoryUsers", gone._id);
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

/** Admin button: kick off a sync now (the daily cron also runs one). */
export const requestSync = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    await ctx.scheduler.runAfter(0, internal.directorySync.run, {});
    return null;
  },
});

/**
 * The synced directory, annotated with whether each person already has a
 * staff profile for the given year — the admin picker filters on that.
 */
export const list = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    if ((await optionalEmail(ctx)) === null) return null; // auth attaching
    await requireAdmin(ctx);
    const state = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", "directory"))
      .unique();
    const users = await ctx.db.query("directoryUsers").take(DIRECTORY_LIMIT);
    const annotated = [];
    for (const user of users) {
      const profile = await getProfile(ctx, user.email, args.year);
      annotated.push({
        email: user.email,
        name: user.name ?? null,
        hasProfile: profile !== null,
      });
    }
    return {
      syncedAt: state?.at ?? null,
      status: state?.detail ?? null,
      users: annotated,
    };
  },
});
