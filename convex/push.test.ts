/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const PHONE = "ExponentPushToken[phone]";

type T = TestConvex<typeof schema>;
const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

const tokens = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("pushTokens").collect()).map((row) => [row.email, row.token])
  );

describe("push.unregister", () => {
  test("signing out forgets this phone for the account that registered it", async () => {
    const t = convexTest(schema, modules);
    await asUser(t, RACHEL).mutation(api.push.register, { token: PHONE });
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[other]" });

    await asUser(t, RACHEL).mutation(api.push.unregister, { token: PHONE });

    expect(await tokens(t)).toEqual([[RACHEL, "ExponentPushToken[other]"]]);
  });

  test("leaves a token that belongs to someone else, an unknown token, or a signed-out caller alone", async () => {
    const t = convexTest(schema, modules);
    await asUser(t, HENRY).mutation(api.push.register, { token: PHONE });

    await asUser(t, RACHEL).mutation(api.push.unregister, { token: PHONE });
    await asUser(t, RACHEL).mutation(api.push.unregister, { token: "ExponentPushToken[never]" });
    expect(await t.mutation(api.push.unregister, { token: PHONE })).toBeNull();

    expect(await tokens(t)).toEqual([[HENRY, PHONE]]);
  });
});
