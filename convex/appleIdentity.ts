// Verification of the identity token returned by Sign in with Apple.
//
// The native sheet (expo-apple-authentication, driven by src/hooks/
// useAppleSignIn.ts) hands the client a signed JWT — the "identity token" —
// that Apple issued for our app. The `apple` provider in auth.ts passes it here
// to verify the signature and claims BEFORE trusting any of its contents.
//
// This module is deliberately free of network / jose-JWKS wiring so it is fully
// unit-testable in the edge-runtime test environment (convex-test cannot reach
// Apple's key endpoint). The caller injects a `verify` function; auth.ts builds
// the real one from Apple's JWKS. See appleIdentity.test.ts.

import { ConvexError } from "convex/values";

/**
 * Discriminator carried by the org-email rejection's ConvexError. The client
 * (src/hooks/useAppleSignIn.ts) keys off this rather than the message, because
 * Convex masks plain Error messages in production — a ConvexError's `data`
 * survives, so the sign-in menu can reliably show the "use your SOW account"
 * guidance instead of a generic failure.
 */
export const APPLE_ORG_EMAIL_REJECTION = "apple-org-email";

/** Apple's fixed OIDC issuer — the `iss` claim every genuine token carries. */
export const APPLE_ISSUER = "https://appleid.apple.com";

/** Apple's public JWKS endpoint (used by the real verifier built in auth.ts). */
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

/** The identity we trust once the token's signature and claims check out. */
export type AppleIdentity = {
  /** Apple's stable per-(user, team) id. The account key — never changes. */
  sub: string;
  /** Lower-cased email (real or a private-relay alias), or null if withheld. */
  email: string | null;
  /** Whether Apple vouches the email is verified. Gates email-based linking. */
  emailVerified: boolean;
};

/**
 * Verifies `identityToken`'s signature and standard claims (issuer, audience,
 * expiry) and returns its payload. Throws on any failure. Injected so tests can
 * drive it with a local keypair and auth.ts can supply Apple's remote JWKS.
 */
export type JwtVerifier = (
  identityToken: string,
  audiences: string[]
) => Promise<Record<string, unknown>>;

/**
 * Verify an Apple identity token and extract the fields we rely on.
 *
 * `rawNonce` is the nonce the client generated for this sign-in. Apple echoes
 * it back in the token's `nonce` claim (expo-apple-authentication forwards the
 * value to Apple verbatim — it does NOT hash it — so the claim equals the raw
 * value the client sent). Requiring a match binds the token to this specific
 * attempt and defeats replay of a captured token. The signature/issuer/audience
 * checks (performed by `verify`) are the primary security; the nonce is
 * defence-in-depth.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  rawNonce: string | undefined,
  audiences: string[],
  verify: JwtVerifier
): Promise<AppleIdentity> {
  if (!identityToken) {
    throw new Error("Missing Apple identity token");
  }
  const payload = await verify(identityToken, audiences);

  if (rawNonce !== undefined) {
    const claimNonce = typeof payload.nonce === "string" ? payload.nonce : null;
    if (claimNonce !== rawNonce) {
      throw new Error("Apple identity token nonce mismatch");
    }
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new Error("Apple identity token missing subject");
  }

  const email =
    typeof payload.email === "string" && payload.email.length > 0
      ? payload.email.toLowerCase()
      : null;

  // Apple sends `email_verified` as either a real boolean or the strings
  // "true" / "false" depending on the endpoint — normalise both.
  const rawVerified = payload.email_verified;
  const emailVerified = rawVerified === true || rawVerified === "true";

  return { sub, email, emailVerified };
}

/**
 * Reject an org (@allowedDomain) address arriving via Apple. Those accounts must
 * use the org-restricted "google" provider so they resolve to their existing
 * staff user/profile; minting an `apple` account for the same person would
 * create a second user row and split their state — the same reasoning that
 * guards the `googlePersonal` provider in auth.ts.
 */
export function assertNotOrgEmail(
  email: string | null,
  allowedDomain: string
): void {
  if (email && email.endsWith(`@${allowedDomain}`)) {
    throw new ConvexError({
      kind: APPLE_ORG_EMAIL_REJECTION,
      message: `Use "Sign in with your SOW account" for your @${allowedDomain} account.`,
    });
  }
}
