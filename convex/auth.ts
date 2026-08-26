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

const allowedDomain = resolveAllowedDomain();

const e2eAuthEnabled = process.env.E2E_AUTH_ENABLED === "true";

const E2eLogin = ConvexCredentials<DataModel>({
  id: "e2e",
  authorize: async (credentials, ctx) => {
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

const APPLE_AUDIENCES = ["au.org.sow.theshed", "au.org.sow.theshed.staging"];

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
    const rawNonce =
      credentials.rawNonce != null ? String(credentials.rawNonce) : undefined;
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
    assertNotOrgEmail(email, allowedDomain);

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
      shouldLinkViaEmail: emailVerified && !!email,
    });
    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
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
        /^https:\/\/[a-z0-9-]+-kimchankwons-projects\.vercel\.app(\/|$|\?)/.test(
          redirectTo
        ) ||
        redirectTo.startsWith("theshedmobile://") ||
        redirectTo.startsWith("theshedmobilestaging://") ||
        /^exp:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?([/?]|$)/.test(
          redirectTo
        )
      ) {
        return redirectTo;
      }
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await linkUserProfiles(ctx, userId);
    },
  },
  providers: [
    Google({
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
    Google({
      id: "googlePersonal",
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: { params: { prompt: "select_account" } },
      profile(profile) {
        const email = (profile.email ?? "").toLowerCase();
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
    AppleLogin,
    ...(e2eAuthEnabled ? [E2eLogin] : []),
  ],
});
