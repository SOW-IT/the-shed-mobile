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

export const googleServiceAccountConfigured = (): boolean =>
  !!process.env.GOOGLE_SA_CLIENT_EMAIL && !!process.env.GOOGLE_SA_PRIVATE_KEY;

// A token for the SOW service account. `subject` impersonates a Workspace user
// (domain-wide delegation); leave it out to act as the service account itself,
// e.g. on a calendar that's been shared with it.
export async function googleAccessToken(scope: string, subject?: string): Promise<string> {
  const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL as string;
  const privateKeyPem = (process.env.GOOGLE_SA_PRIVATE_KEY as string).replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: clientEmail,
    ...(subject ? { sub: subject } : {}),
    scope,
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
