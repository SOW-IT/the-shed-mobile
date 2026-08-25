import { ConvexError } from "convex/values";

export const APPLE_ORG_EMAIL_REJECTION = "apple-org-email";

export const APPLE_ISSUER = "https://appleid.apple.com";

export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

export type AppleIdentity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
};

export type JwtVerifier = (
  identityToken: string,
  audiences: string[]
) => Promise<Record<string, unknown>>;

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

  const rawVerified = payload.email_verified;
  const emailVerified = rawVerified === true || rawVerified === "true";

  return { sub, email, emailVerified };
}

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
