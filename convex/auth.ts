import Google from "@auth/core/providers/google";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount, retrieveAccount } from "@convex-dev/auth/server";
import { DataModel } from "./_generated/dataModel";
import { linkUserProfiles } from "./userLink";

// Only accounts from this Google Workspace organisation may sign in.
const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";

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
        redirectTo.startsWith("exp://")
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
      // `hd` asks Google to restrict the account picker to the organisation;
      // the profile callback enforces it server-side (hd alone is advisory).
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
    // Present only on deployments with E2E_AUTH_ENABLED === "true" (never prod).
    ...(e2eAuthEnabled ? [E2eLogin] : []),
  ],
});
