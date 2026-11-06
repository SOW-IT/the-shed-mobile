const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;

  if (!encoded) {
    throw new Error("Spotify encryption key is not configured.");
  }

  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));

  if (bytes.length !== 32) {
    throw new Error("Spotify encryption key must be 32 bytes.");
  }

  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSpotifyToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(token),
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptSpotifyToken(
  encryptedToken: string,
): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedToken), (c) =>
    c.charCodeAt(0),
  );

  if (combined.length < 29) {
    throw new Error("Invalid encrypted Spotify token.");
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await encryptionKey();

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return decoder.decode(decrypted);
}
