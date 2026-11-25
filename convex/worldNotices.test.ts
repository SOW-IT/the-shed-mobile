import { describe, expect, test } from "vitest";
import { NOTICES_MAX } from "../shared/worldNotices";
import { api } from "./_generated/api";
import { ADMIN, LEADER, OUTSIDER, STAFF, asUser, campusSetup, newConvex } from "../test/convexFixture";

describe("worldNotices", () => {
  test("only admins pin, edit and take down notices", async () => {
    const t = await campusSetup();
    const admin = asUser(t, ADMIN);
    const staff = asUser(t, STAFF);
    await expect(staff.mutation(api.worldNotices.pin, { text: "Hi" })).rejects.toThrow(/Only admins/);
    await expect(asUser(t, OUTSIDER).mutation(api.worldNotices.pin, { text: "Hi" })).rejects.toThrow(/No role/);
    await expect(t.mutation(api.worldNotices.pin, { text: "Hi" })).rejects.toThrow(/signed in/);

    const id = await admin.mutation(api.worldNotices.pin, { title: "  Camp  ", text: "  Sign up by Friday " });
    await expect(staff.mutation(api.worldNotices.edit, { id, text: "Mine now" })).rejects.toThrow(/Only admins/);
    await expect(staff.mutation(api.worldNotices.remove, { id })).rejects.toThrow(/Only admins/);

    const seen = await staff.query(api.worldNotices.list, {});
    expect(seen).toMatchObject({ canPin: false, notices: [{ id, title: "Camp", text: "Sign up by Friday", editedAt: null }] });
    expect((await admin.query(api.worldNotices.list, {}))?.canPin).toBe(true);

    await admin.mutation(api.worldNotices.edit, { id, title: "", text: "Sign up by Monday" });
    expect((await staff.query(api.worldNotices.list, {}))?.notices[0]).toMatchObject({ title: null, text: "Sign up by Monday" });
    expect((await staff.query(api.worldNotices.list, {}))?.notices[0].editedAt).toEqual(expect.any(Number));

    await admin.mutation(api.worldNotices.remove, { id });
    expect((await staff.query(api.worldNotices.list, {}))?.notices).toEqual([]);
    await admin.mutation(api.worldNotices.remove, { id });
    await expect(admin.mutation(api.worldNotices.edit, { id, text: "Back" })).rejects.toThrow(/taken down/);
  });

  test("the board is read with the same gate as notifications: signed in with a role", async () => {
    const t = await campusSetup();
    await asUser(t, ADMIN).mutation(api.worldNotices.pin, { text: "Hello" });
    expect(await t.query(api.worldNotices.list, {})).toBeNull();
    expect(await asUser(t, OUTSIDER).query(api.worldNotices.list, {})).toBeNull();
    expect((await asUser(t, LEADER).query(api.worldNotices.list, {}))?.notices).toHaveLength(1);
  });

  test("checks what's written and how many are up", async () => {
    const t = await campusSetup();
    const admin = asUser(t, ADMIN);
    await expect(admin.mutation(api.worldNotices.pin, { text: "   " })).rejects.toThrow(/Write the notice/);
    await expect(admin.mutation(api.worldNotices.pin, { text: "x".repeat(401) })).rejects.toThrow(/400 characters/);
    await expect(admin.mutation(api.worldNotices.pin, { title: "t".repeat(61), text: "ok" })).rejects.toThrow(/heading/);
    for (let i = 0; i < NOTICES_MAX; i++) await admin.mutation(api.worldNotices.pin, { text: `Notice ${i}` });
    await expect(admin.mutation(api.worldNotices.pin, { text: "One more" })).rejects.toThrow(/holds 30/);
    const list = await admin.query(api.worldNotices.list, {});
    expect(list?.notices[0].text).toBe(`Notice ${NOTICES_MAX - 1}`);
  });

  test("a notice from someone blocked either way in the World isn't shown", async () => {
    const t = await campusSetup();
    const admin = asUser(t, ADMIN);
    const staff = asUser(t, STAFF);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.worldNotices.pin, { text: "From the admin" });
    const a = await admin.mutation(api.world.join, {});
    if (!("memberId" in a)) throw new Error("admin didn't join");
    await staff.mutation(api.world.join, {});
    await staff.mutation(api.world.block, { memberId: a.memberId });
    expect((await staff.query(api.worldNotices.list, {}))?.notices).toEqual([]);
    expect((await leader.query(api.worldNotices.list, {}))?.notices).toHaveLength(1);

    const s = await staff.mutation(api.world.join, {});
    if (!("memberId" in s)) throw new Error("staff didn't join");
    await leader.mutation(api.world.join, {});
    await admin.mutation(api.world.block, { memberId: s.memberId });
    // The admin blocking the staff member doesn't hide the admin's own notice from the admin.
    expect((await admin.query(api.worldNotices.list, {}))?.notices).toHaveLength(1);
  });

  test("an empty deployment reads as an empty board", async () => {
    const t = newConvex();
    expect(await t.query(api.worldNotices.list, {})).toBeNull();
  });
});
