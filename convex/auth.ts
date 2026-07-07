import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DataModel } from "./_generated/dataModel";
import {
  APPLE_ISSUER,
  APPLE_JWKS_URL,
  assertNotOrgEmail,
  verifyAppleIdentityToken,
} from "./appleIdentity";
import { allowedDomain as resolveAllowedDomain } from "./model";
import { linkUserProfiles } from "./userLink";

// The organisation's Google Workspace domain. Single source of truth lives in
// model.ts (also used by the admin org-only filters); resolved once here.
const allowedDomain = resolveAllowedDomain();

// ── E2E test-login (NON-PRODUCTION ONLY) ─────────────────────────────────────
// A credentials provider that signs in as an existing sow.org.au email WITHOUT
// Google OAuth, so automated tests (Maestro) can drive signed-in flows without
// a scriptable browser sign-in. Because roles resolve by email via
// linkUserProfiles, signing in this way yields exactly the same profiles/roles
// as the real Google sign-in for that address.
//
// SECURITY — this provider is gated by TWO independent controls, both of which
// must hold, and it is simply ABSENT unless the first does:
//   1. It is only added to `providers` when E2E_AUTH_ENABLED === "true". This
//      env var must NEVER be set on the production deployment. With it unset,
//      `signIn("e2e", …)` fails with "provider not found" — there is no code
//      path to a bypass in production, even if the client shipped the deep link.
//   2. Every call must present the shared secret E2E_AUTH_SECRET. Set this only
//      on the dedicated E2E deployment (see .maestro/README.md).
// It is also domain-restricted to @${allowedDomain}, same as Google.
const e2eAuthEnabled = process.env.E2E_AUTH_ENABLED === "true";

const E2eLogin = ConvexCredentials<DataModel>({
  id: "e2e",
  authorize: async (credentials, ctx) => {
    // Defence in depth: refuse even if the provider was somehow registered
    // without the enable flag.
    if (process.env.E2E_AUTH_ENABLED !== "true") {
      throw new Error("E2E auth is not enabled on this deployment");
    }
    const expected = process.env.E2E_AUTH_SECRET;
    if (!expected || String(credentials.secret ?? "") !== expected) {
      throw new Error("Invalid E2E secret");
    }
    const email = String(credentials.email ?? "")
      .toLowerCase()
      .trim();
    if (!email.endsWith(`@${allowedDomain}`)) {
      throw new Error(`Only ${allowedDomain} accounts can use E2E login`);
    }
    // Reuse the e2e account for this email if it exists; otherwise create it and
    // link via the (test-)verified email so it binds to the same user the Google
    // account would — profiles/roles then resolve identically.
    const existing = await retrieveAccount(ctx, {
      provider: "e2e",
      account: { id: email },
    }).catch(() => null);
    if (existing) return { userId: existing.user._id };
    const { user } = await createAccount(ctx, {
      provider: "e2e",
      account: { id: email },
      profile: {
        email,
        name: email.split("@")[0],
        emailVerificationTime: Date.now(),
      },
      shouldLinkViaEmail: true,
    });
    return { userId: user._id };
  },
});

// ── Sign in with Apple ───────────────────────────────────────────────────────
// The equivalent third-party login required by App Store Guideline 4.8: it
// limits data to name + email, lets users hide their email behind a private
// relay, and doesn't harvest interactions for ads. The native sheet (client:
// src/hooks/useAppleSignIn.ts) returns a signed identity token; we verify it
// here against Apple's public keys and mint/reuse an account keyed by Apple's
// stable `sub`. No browser redirect and no redirect-callback entry are involved
// — the token arrives in-process. Claim/nonce/domain logic (and its tests) live
// in appleIdentity.ts; only the JWKS/network wiring stays here, out of coverage.
//
// Both bundle ids are accepted as the token audience so the same code serves
// production and the side-by-side staging app (see app.config.js).
const APPLE_AUDIENCES = ["au.org.sow.theshed", "au.org.sow.theshed.staging"];

// Apple's JWKS, fetched lazily and cached for this isolate's lifetime. jose is
// edge-compatible, so this runs in the default Convex runtime (no "use node").
let appleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
const verifyAppleJwt = async (
  identityToken: string,
  audiences: string[]
): Promise<Record<string, unknown>> => {
  appleJwks ??= createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });
  return payload as Record<string, unknown>;
};

const AppleLogin = ConvexCredentials<DataModel>({
  id: "apple",
  authorize: async (credentials, ctx) => {
    const identityToken = String(credentials.identityToken ?? "");
    // Apple echoes this nonce into the token; a match binds the token to this
    // sign-in attempt. Optional — older clients / non-native paths may omit it.
    const rawNonce =
      credentials.rawNonce != null ? String(credentials.rawNonce) : undefined;
    // Apple returns the display name ONLY on the first authorization for this
    // Apple ID; the client forwards it because it never appears in the token.
    const fullName =
      typeof credentials.fullName === "string" && credentials.fullName.trim()
        ? credentials.fullName.trim()
        : null;

    const { sub, email, emailVerified } = await verifyAppleIdentityToken(
      identityToken,
      rawNonce,
      APPLE_AUDIENCES,
      verifyAppleJwt
    );
    // Org accounts must use the staff "google" provider so they resolve to their
    // existing user/profile (same guard as googlePersonal).
    assertNotOrgEmail(email, allowedDomain);

    // Reuse the account for this Apple ID if it exists; otherwise create it.
    const existing = await retrieveAccount(ctx, {
      provider: "apple",
      account: { id: sub },
    }).catch(() => null);
    if (existing) return { userId: existing.user._id };

    const { user } = await createAccount(ctx, {
      provider: "apple",
      account: { id: sub },
      profile: {
        name: fullName ?? email?.split("@")[0] ?? "Apple user",
        ...(email ? { email } : {}),
        ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
      },
      // Link by email only when Apple vouches it's verified: someone who
      // previously used "Sign in with Google" with the same address then
      // resolves to the SAME user instead of a duplicate. An unverified /
      // withheld email is never trusted for linking.
      shouldLinkViaEmail: emailVerified && !!email,
    });
    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
    // Where sign-in may return to. The client passes its own origin so the
    // hosted site, local dev/static servers and the native app all come back
    // to themselves instead of defaulting to SITE_URL.
    async redirect({ redirectTo }) {
      const allowed = [process.env.SITE_URL, process.env.APP_URL].filter(
        (url): url is string => !!url
      );
      if (redirectTo.startsWith("/")) {
        return `${process.env.SITE_URL ?? ""}${redirectTo}`;
      }
      if (
        allowed.some((url) => redirectTo === url || redirectTo.startsWith(`${url}/`)) ||
        /^https?:\/\/localhost(:\d+)?(\/|$|\?)/.test(redirectTo) ||
        // Vercel preview deployments (per-branch / per-commit URLs). Scoped to
        // our Vercel team (kimchankwons-projects) — the real security boundary,
        // since only we can create projects there — rather than a single project
        // name, which broke when the web project was renamed the-shed-web ->
        // the-shed in the rebrand. Still not an open redirect to any *.vercel.app.
        /^https:\/\/[a-z0-9-]+-kimchankwons-projects\.vercel\.app(\/|$|\?)/.test(
          redirectTo
        ) ||
        redirectTo.startsWith("theshedmobile://") ||
        // Staging app variant (separate bundle id) uses its own scheme so it can
        // be installed alongside production — see app.config.js.
        redirectTo.startsWith("theshedmobilestaging://") ||
        // Expo Go during local dev only. exp://<host> makes Expo Go load a
        // bundle FROM that host, so a bare exp:// prefix would hand the OAuth
        // code to an attacker-controlled bundle via a crafted sign-in link.
        // Restrict to loopback / RFC1918 LAN hosts — the only places a dev
        // server legitimately runs.
        /^exp:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?([/?]|$)/.test(
          redirectTo
        )
      ) {
        return redirectTo;
      }
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
    // Bind staff profiles to the user id on every sign-in, and re-key all
    // email references if the Google account's email changed (rename).
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await linkUserProfiles(ctx, userId);
    },
  },
  providers: [
    Google({
      // The staff sign-in. `hd` asks Google to restrict the account picker to
      // the organisation; the profile callback enforces it server-side (hd
      // alone is advisory). Non-org accounts use the `googlePersonal` provider
      // below instead.
      authorization: { params: { hd: allowedDomain, prompt: "select_account" } },
      profile(profile) {
        const email = (profile.email ?? "").toLowerCase();
        if (!email.endsWith(`@${allowedDomain}`)) {
          throw new Error(`Only ${allowedDomain} Google accounts can sign in`);
        }
        return {
          id: profile.sub,
          name: profile.name,
          email,
          image: profile.picture,
        };
      },
    }),
    // Non-staff Google sign-in (1.7.4): any Google account may sign in here.
    // Reuses the same Google OAuth client as the staff provider (explicit
    // clientId/secret, since @auth/core would otherwise look for
    // AUTH_GOOGLEPERSONAL_ID), but drops the `hd` hint and the domain check so
    // personal accounts can reach the public surfaces (Home, Org, Insights).
    // A personal account never resolves to a staff profile — staff roles link
    // by @${allowedDomain} email — so it stays a visitor with an account, and
    // is excluded from the admin Users assignment lists.
    // NOTE: the Google Cloud OAuth consent screen must be "External" for
    // non-org accounts to be accepted by Google itself.
    Google({
      id: "googlePersonal",
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: "select_account" } },
      profile(profile) {
        const email = (profile.email ?? "").toLowerCase();
        // Org accounts must use the staff "google" provider above so they
        // resolve to their existing user/profile. Letting a sow.org.au account
        // in here would mint a second auth account for the same person (a
        // different provider id → a separate account row) and split their state.
        if (email.endsWith(`@${allowedDomain}`)) {
          throw new Error(
            `Use "Sign in with your SOW account" for your @${allowedDomain} account.`
          );
        }
        return {
          id: profile.sub,
          name: profile.name,
          email,
          image: profile.picture,
        };
      },
    }),
    // Sign in with Apple (iOS) — the Guideline 4.8 equivalent login. Verified
    // server-side against Apple's public keys; see AppleLogin above.
    AppleLogin,
    // Present only on deployments with E2E_AUTH_ENABLED === "true" (never prod).
    ...(e2eAuthEnabled ? [E2eLogin] : []),
  ],
});
