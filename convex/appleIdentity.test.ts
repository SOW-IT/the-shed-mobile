/// <reference types="vite/client" />
import {
  type KeyObject,
  SignJWT,
  generateKeyPair,
  jwtVerify,
} from "jose";
import { ConvexError } from "convex/values";
import { beforeAll, describe, expect, test } from "vitest";
import {
  APPLE_ISSUER,
  APPLE_ORG_EMAIL_REJECTION,
  type JwtVerifier,
  assertNotOrgEmail,
  verifyAppleIdentityToken,
} from "./appleIdentity";

const AUD = "au.org.sow.theshed";
const AUDIENCES = [AUD, "au.org.sow.theshed.staging"];

// A real jose keypair so we can mint genuinely-signed tokens and verify them
// through the same jose path auth.ts uses — proving signature/issuer/audience/
// expiry enforcement, not just our claim parsing.
let privateKey: KeyObject | CryptoKey;
let realVerify: JwtVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  realVerify = async (token, audiences) => {
    const { payload } = await jwtVerify(token, pair.publicKey, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });
    return payload;
  };
});

/** Mint a signed token with sensible Apple-like defaults, overridable per test. */
const sign = (
  claims: Record<string, unknown>,
  opts: { issuer?: string; audience?: string; expiresIn?: string } = {}
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(opts.issuer ?? APPLE_ISSUER)
    .setAudience(opts.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(privateKey);

/** A fake verifier returning a fixed payload — for exercising claim parsing. */
const fakeVerify =
  (payload: Record<string, unknown>): JwtVerifier =>
  async () =>
    payload;

describe("verifyAppleIdentityToken — signature & claims (real jose)", () => {
  test("accepts a valid token and extracts identity", async () => {
    const token = await sign({
      sub: "001234.abcdef",
      email: "Person@Example.com",
      email_verified: true,
      nonce: "nonce-123",
    });
    const id = await verifyAppleIdentityToken(
      token,
      "nonce-123",
      AUDIENCES,
      realVerify
    );
    expect(id).toEqual({
      sub: "001234.abcdef",
      email: "person@example.com", // lower-cased
      emailVerified: true,
    });
  });

  test("accepts the staging bundle id as audience", async () => {
    const token = await sign(
      { sub: "s1", email: "a@example.com", email_verified: true },
      { audience: "au.org.sow.theshed.staging" }
    );
    const id = await verifyAppleIdentityToken(token, undefined, AUDIENCES, realVerify);
    expect(id.sub).toBe("s1");
  });

  test("rejects a wrong audience", async () => {
    const token = await sign(
      { sub: "s1" },
      { audience: "com.someone.else" }
    );
    await expect(
      verifyAppleIdentityToken(token, undefined, AUDIENCES, realVerify)
    ).rejects.toThrow();
  });

  test("rejects a wrong issuer", async () => {
    const token = await sign({ sub: "s1" }, { issuer: "https://evil.example" });
    await expect(
      verifyAppleIdentityToken(token, undefined, AUDIENCES, realVerify)
    ).rejects.toThrow();
  });

  test("rejects an expired token", async () => {
    const token = await sign({ sub: "s1" }, { expiresIn: "-1s" });
    await expect(
      verifyAppleIdentityToken(token, undefined, AUDIENCES, realVerify)
    ).rejects.toThrow();
  });
});

describe("verifyAppleIdentityToken — nonce", () => {
  test("rejects when the token nonce does not match", async () => {
    const token = await sign({ sub: "s1", nonce: "server-sent" });
    await expect(
      verifyAppleIdentityToken(token, "attacker", AUDIENCES, realVerify)
    ).rejects.toThrow(/nonce mismatch/);
  });

  test("rejects when a nonce is expected but the token carries none", async () => {
    await expect(
      verifyAppleIdentityToken(
        "t",
        "expected",
        AUDIENCES,
        fakeVerify({ sub: "s1" })
      )
    ).rejects.toThrow(/nonce mismatch/);
  });

  test("skips the nonce check when the client sent none", async () => {
    const id = await verifyAppleIdentityToken(
      "t",
      undefined,
      AUDIENCES,
      fakeVerify({ sub: "s1", nonce: "whatever" })
    );
    expect(id.sub).toBe("s1");
  });
});

describe("verifyAppleIdentityToken — claim parsing", () => {
  test("throws on an empty token before verifying", async () => {
    let called = false;
    const spy: JwtVerifier = async () => {
      called = true;
      return {};
    };
    await expect(
      verifyAppleIdentityToken("", undefined, AUDIENCES, spy)
    ).rejects.toThrow(/Missing Apple identity token/);
    expect(called).toBe(false);
  });

  test("throws when the subject is missing or non-string", async () => {
    await expect(
      verifyAppleIdentityToken("t", undefined, AUDIENCES, fakeVerify({}))
    ).rejects.toThrow(/missing subject/);
    await expect(
      verifyAppleIdentityToken("t", undefined, AUDIENCES, fakeVerify({ sub: 42 }))
    ).rejects.toThrow(/missing subject/);
  });

  test('treats email_verified === "true" (string) as verified', async () => {
    const id = await verifyAppleIdentityToken(
      "t",
      undefined,
      AUDIENCES,
      fakeVerify({ sub: "s1", email: "a@b.com", email_verified: "true" })
    );
    expect(id.emailVerified).toBe(true);
  });

  test("treats a falsey/absent email_verified as unverified", async () => {
    const id = await verifyAppleIdentityToken(
      "t",
      undefined,
      AUDIENCES,
      fakeVerify({ sub: "s1", email: "a@b.com", email_verified: "false" })
    );
    expect(id.emailVerified).toBe(false);
  });

  test("returns null email when Apple withholds it (Hide My Email declined scope)", async () => {
    const id = await verifyAppleIdentityToken(
      "t",
      undefined,
      AUDIENCES,
      fakeVerify({ sub: "s1" })
    );
    expect(id.email).toBeNull();
    expect(id.emailVerified).toBe(false);
  });

  test("treats an empty-string email as withheld", async () => {
    const id = await verifyAppleIdentityToken(
      "t",
      undefined,
      AUDIENCES,
      fakeVerify({ sub: "s1", email: "" })
    );
    expect(id.email).toBeNull();
  });
});

describe("assertNotOrgEmail", () => {
  test("rejects an org-domain address with a client-detectable ConvexError", () => {
    try {
      assertNotOrgEmail("staff@sow.org.au", "sow.org.au");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      const data = (e as ConvexError<{ kind: string; message: string }>).data;
      expect(data.kind).toBe(APPLE_ORG_EMAIL_REJECTION);
      expect(data.message).toMatch(/Sign in with your SOW account/);
    }
  });

  test("allows a personal address", () => {
    expect(() => assertNotOrgEmail("me@gmail.com", "sow.org.au")).not.toThrow();
  });

  test("allows a null email (Hide My Email / withheld)", () => {
    expect(() => assertNotOrgEmail(null, "sow.org.au")).not.toThrow();
  });
});
