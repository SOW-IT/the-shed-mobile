import { ConvexError } from "convex/values";
import { decodeJwt, importPKCS8, SignJWT } from "jose";
import { APPLE_AUDIENCES, APPLE_ISSUER } from "./appleIdentity";

const CLIENT_SECRET_TTL_SECONDS = 300;

type AppleKey = { teamId: string; keyId: string; privateKey: string };

const appleKey = (): AppleKey | null => {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return teamId && keyId && privateKey ? { teamId, keyId, privateKey } : null;
};

const clientSecret = async (key: AppleKey, clientId: string): Promise<string> =>
  await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: key.keyId })
    .setIssuer(key.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${CLIENT_SECRET_TTL_SECONDS}s`)
    .sign(await importPKCS8(key.privateKey, "ES256"));

const post = async (path: string, form: Record<string, string>): Promise<Response> =>
  await fetch(`${APPLE_ISSUER}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

export async function revokeAppleTokens({
  authorizationCode,
  clientId,
  subject,
}: {
  authorizationCode: string;
  clientId: string;
  subject: string;
}): Promise<"revoked" | "skipped"> {
  if (!APPLE_AUDIENCES.includes(clientId)) {
    throw new ConvexError("That isn't The SHED's Apple sign-in.");
  }
  const key = appleKey();
  if (!key) {
    console.warn("Apple token revoke skipped: APPLE_TEAM_ID, APPLE_KEY_ID or APPLE_PRIVATE_KEY is not set");
    return "skipped";
  }
  const secret = await clientSecret(key, clientId);
  const exchanged = await post("token", {
    client_id: clientId,
    client_secret: secret,
    code: authorizationCode,
    grant_type: "authorization_code",
  });
  if (!exchanged.ok) {
    console.error(`Apple token exchange failed: ${exchanged.status} ${await exchanged.text()}`);
    return "skipped";
  }
  const tokens = (await exchanged.json()) as {
    id_token?: string;
    refresh_token?: string;
    access_token?: string;
  };
  if (!tokens.id_token || decodeJwt(tokens.id_token).sub !== subject) {
    throw new ConvexError("Sign in with the same Apple ID you use for The SHED.");
  }
  const [token, hint] = tokens.refresh_token
    ? [tokens.refresh_token, "refresh_token"]
    : [tokens.access_token ?? "", "access_token"];
  const revoked = await post("revoke", {
    client_id: clientId,
    client_secret: secret,
    token,
    token_type_hint: hint,
  });
  if (!revoked.ok) {
    console.error(`Apple token revoke failed: ${revoked.status} ${await revoked.text()}`);
    return "skipped";
  }
  return "revoked";
}
