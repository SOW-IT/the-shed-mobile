import { beforeAll, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

const EMAIL_A = "alice@example.com";
const EMAIL_B = "bob@example.com";

describe("contact.submit rate limiting", () => {
  beforeAll(() => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "sow@test.com";
  });

  test("accepts a valid public contact message", async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(api.contact.submit, {
      email: EMAIL_A,
      message: "Hello from SOW",
    });
    expect(res).toBeNull();
  });

  test("rejects invalid emails", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.contact.submit, {
        email: "not-an-email",
        message: "Hi",
      })
    ).rejects.toThrow("valid email address");
  });

  test("rejects short/long messages", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.contact.submit, { email: EMAIL_A, message: "x" })
    ).rejects.toThrow("message");

    await expect(
      t.mutation(api.contact.submit, {
        email: EMAIL_A,
        message: "x".repeat(5001),
      })
    ).rejects.toThrow("shorten it");
  });

  test("blocks a fourth submission in the same hour", async () => {
    const t = convexTest(schema, modules);
    for (const idx of [0, 1, 2]) {
      await t.mutation(api.contact.submit, {
        email: EMAIL_B,
        message: `msg ${idx}`,
      });
    }

    await expect(
      t.mutation(api.contact.submit, {
        email: EMAIL_B,
        message: "spam",
      })
    ).rejects.toThrow("wait an hour");
  });

  test("rate limit is per-email, not global", async () => {
    const t = convexTest(schema, modules);
    for (const idx of [0, 1, 2]) {
      await t.mutation(api.contact.submit, {
        email: EMAIL_A,
        message: `msg ${idx}`,
      });
    }

    const res = await t.mutation(api.contact.submit, {
      email: EMAIL_B,
      message: "different sender",
    });

    expect(res).toBeNull();
  });
});
