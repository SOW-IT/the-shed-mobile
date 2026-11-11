import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { type T, newConvex, asUser } from "../test/convexFixture";

const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const PHONE = "ExponentPushToken[phone]";

const tokens = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query("pushTokens").collect()).map((row) => [row.email, row.token])
  );

describe("push.unregister", () => {
  test("signing out forgets this phone for the account that registered it", async () => {
    const t = newConvex();
    await asUser(t, RACHEL).mutation(api.push.register, { token: PHONE });
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[other]" });

    await asUser(t, RACHEL).mutation(api.push.unregister, { token: PHONE });

    expect(await tokens(t)).toEqual([[RACHEL, "ExponentPushToken[other]"]]);
  });

  test("leaves a token that belongs to someone else, an unknown token, or a signed-out caller alone", async () => {
    const t = newConvex();
    await asUser(t, HENRY).mutation(api.push.register, { token: PHONE });

    await asUser(t, RACHEL).mutation(api.push.unregister, { token: PHONE });
    await asUser(t, RACHEL).mutation(api.push.unregister, { token: "ExponentPushToken[never]" });
    expect(await t.mutation(api.push.unregister, { token: PHONE })).toBeNull();

    expect(await tokens(t)).toEqual([[HENRY, PHONE]]);
  });
});

describe("push.register and removeToken", () => {
  test("re-registering the same phone keeps one row; removing an unknown token is a no-op", async () => {
    const t = newConvex();
    await asUser(t, RACHEL).mutation(api.push.register, { token: PHONE });
    await asUser(t, RACHEL).mutation(api.push.register, { token: PHONE });
    expect(await tokens(t)).toEqual([[RACHEL, PHONE]]);

    expect(await t.mutation(internal.push.removeToken, { token: "ExponentPushToken[never]" })).toBeNull();
    expect(await tokens(t)).toEqual([[RACHEL, PHONE]]);
    await t.mutation(internal.push.removeToken, { token: PHONE });
    expect(await tokens(t)).toEqual([]);
  });
});
