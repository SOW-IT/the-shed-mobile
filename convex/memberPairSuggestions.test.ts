import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

type MemberId = Id<"attendanceMembers">;

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const { campusField, roleField } = await t.run(async (ctx) => {
    await ctx.db.insert("staffProfiles", {
      email: LEADER,
      name: "Lee Der",
      year: YEAR,
      assignments: [{ role: "Student Leader", university: USYD }],
    });
    return {
      campusField: await ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { usyd: USYD, unsw: UNSW },
      }),
      roleField: await ctx.db.insert("attendanceMetadata", {
        key: "Role",
        type: "select",
        order: 1,
        values: { member: "Member" },
      }),
    };
  });
  const member = (name: string, metadata: Record<string, string> = {}, email?: string) =>
    t.run((ctx) => ctx.db.insert("attendanceMembers", { name, metadata, email }));
  const onCampus = (name: string, extra: Record<string, string> = {}) =>
    member(name, { [campusField]: "usyd", ...extra });
  const staffOf = (memberId: MemberId, year: number, email: string) =>
    t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email,
        name: "Someone",
        year,
        memberId,
        assignments: [{ role: "Student Leader", university: USYD }],
      })
    );
  const event = (dateStart: number) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        name: `Weekly ${dateStart}`,
        dateStart,
        dateEnd: dateStart + 1,
        subgroups: [],
      })
    );
  const signIn = (eventId: Id<"events">, memberId: MemberId, signInTime: number) =>
    t.run((ctx) => ctx.db.insert("attendance", { eventId, memberId, signInTime }));
  const rebuild = () => t.action(internal.memberPairSuggestions.rebuild, {});
  const rows = () => t.run((ctx) => ctx.db.query("memberPairSuggestions").collect());
  const admin = asUser(t, ADMIN);
  const pairs = async () =>
    (await admin.query(api.memberPairSuggestions.list, {}))!.map((p) =>
      [p.a.name, p.b.name].sort()
    );
  return {
    t,
    admin,
    leader: asUser(t, LEADER),
    campusField,
    roleField,
    member,
    onCampus,
    staffOf,
    event,
    signIn,
    rebuild,
    rows,
    pairs,
  };
}

describe("suggested member pairs", () => {
  test("the nightly build stores lookalike members on one campus who were never at one event", async () => {
    const s = await setup();
    const hana = await s.onCampus("Hana Doe", { [s.roleField]: "member" });
    const hanaSpaced = await s.onCampus("hana  doe", { [s.roleField]: "Leader" });
    const e1 = await s.event(5_000);
    const e2 = await s.event(9_000);
    const e3 = await s.event(9_500);
    await s.signIn(e1, hana, 5_000);
    await s.signIn(e2, hana, 9_000);
    await s.signIn(e3, hanaSpaced, 9_500);
    await s.onCampus("Mia Lee");
    await s.onCampus("Mia Lea");
    await s.member("Kai Park", {}, "kai@example.com");
    await s.member("Kai Park");
    await s.member("Hana Doe", { [s.campusField]: "unsw" });
    await s.member("Hana Doe");
    const tom = await s.onCampus("Tom Reed");
    const tomAgain = await s.onCampus("Tom Reed");
    await s.signIn(e1, tom, 5_000);
    await s.signIn(e1, tomAgain, 5_100);
    await s.staffOf(await s.onCampus("Lee Der"), YEAR, LEADER);
    await s.onCampus("Lee Der");
    await s.staffOf(await s.onCampus("Zoe Last"), YEAR - 1, "zoe.last@sow.org.au");
    await s.onCampus("Zoe Last");
    await s.staffOf(await s.onCampus("Old Hand"), YEAR - 2, "old.hand@sow.org.au");
    await s.onCampus("Old Hand");

    await s.rebuild();

    const listed = await s.admin.query(api.memberPairSuggestions.list, {});
    expect(listed!.map((p) => [[p.a.name, p.b.name].sort(), p.match])).toEqual([
      [["Hana Doe", "hana  doe"], "same"],
      [["Kai Park", "Kai Park"], "same"],
      [["Mia Lea", "Mia Lee"], "typo"],
      [["Old Hand", "Old Hand"], "same"],
    ]);
    const hanaPair = listed!.find((p) => p.a.memberId === hana || p.b.memberId === hana)!;
    const sides = [hanaPair.a, hanaPair.b].sort((x, y) => y.signIns - x.signIns);
    expect(sides).toEqual([
      {
        memberId: hana,
        name: "Hana Doe",
        email: undefined,
        campus: USYD,
        role: "Member",
        signIns: 2,
        lastSignIn: 9_000,
      },
      {
        memberId: hanaSpaced,
        name: "hana  doe",
        email: undefined,
        campus: USYD,
        role: "Leader",
        signIns: 1,
        lastSignIn: 9_500,
      },
    ]);
    const kai = listed!.find((p) => p.a.name === "Kai Park")!;
    expect([kai.a.email, kai.b.email].sort()).toEqual(["kai@example.com", undefined]);
    expect(kai.a.campus).toBeUndefined();
    expect(kai.a.role).toBeUndefined();
  });

  test("building again keeps one row per pair and drops pairs that no longer hold", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    const c = await s.onCampus("Mia Lee");
    const d = await s.onCampus("Mia Lee");
    await s.rebuild();
    expect(await s.rows()).toHaveLength(2);
    const [first] = await s.rows();

    const e = await s.event(5_000);
    await s.signIn(e, c, 5_000);
    await s.signIn(e, d, 5_000);
    await s.rebuild();

    const after = await s.rows();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ status: "open", memberA: a < b ? a : b, memberB: a < b ? b : a });
    const kept = after[0]._id === first._id || first.memberA === c || first.memberA === d;
    expect(kept).toBe(true);
    expect(after[0].builtAt).toBeGreaterThanOrEqual(first.builtAt);
  });

  test("a stored pair is checked against live names and campuses when listed", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    await s.rebuild();
    expect(await s.pairs()).toEqual([["Hana Doe", "Hana Doe"]]);

    await s.t.run((ctx) => ctx.db.patch(b, { metadata: { [s.campusField]: "unsw" } }));
    expect(await s.pairs()).toEqual([]);

    await s.t.run((ctx) =>
      ctx.db.patch(b, { name: "Zed Quill", metadata: { [s.campusField]: "usyd" } })
    );
    expect(await s.pairs()).toEqual([]);

    await s.t.run((ctx) => ctx.db.delete(a));
    expect(await s.pairs()).toEqual([]);
  });

  test("Not the same hides a pair for good, whichever way round it is said", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    await s.rebuild();
    expect(await s.pairs()).toHaveLength(1);

    await s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: b, memberB: a });
    await s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: a, memberB: b });
    expect(await s.pairs()).toEqual([]);
    await s.rebuild();
    expect(await s.pairs()).toEqual([]);

    const rows = await s.rows();
    expect(rows).toEqual([
      expect.objectContaining({
        memberA: a < b ? a : b,
        memberB: a < b ? b : a,
        status: "dismissed",
        dismissedBy: ADMIN,
      }),
    ]);
    const audit = await s.t.run((ctx) =>
      ctx.db
        .query("attendanceAuditLog")
        .filter((q) => q.eq(q.field("action"), "member.notSame"))
        .collect()
    );
    expect(audit.map((e) => [e.memberId, e.summary]).sort()).toEqual(
      [
        [a, `Marked "Hana Doe" as not the same person as "Hana Doe"`],
        [b, `Marked "Hana Doe" as not the same person as "Hana Doe"`],
      ].sort()
    );
    expect(audit.every((e) => e.actorEmail === ADMIN && e.detail?.includes("Hana Doe ("))).toBe(true);
  });

  test("a pair can be dismissed before it was ever suggested", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    await s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: a, memberB: b });
    await s.rebuild();
    expect(await s.pairs()).toEqual([]);
    expect(await s.rows()).toEqual([expect.objectContaining({ status: "dismissed" })]);
  });

  test("a merged pair disappears at once and its rows go at the next build", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    const c = await s.onCampus("Mia Lee");
    const d = await s.onCampus("Mia Lee");
    await s.rebuild();
    await s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: c, memberB: d });
    expect(await s.pairs()).toEqual([["Hana Doe", "Hana Doe"]]);

    await s.admin.mutation(api.attendanceMembers.merge, {
      removeId: b,
      keep: { memberId: a },
      resolutions: {},
      staffYear: YEAR,
    });
    await s.t.run((ctx) => ctx.db.delete(d));
    expect(await s.pairs()).toEqual([]);
    expect(await s.rows()).toHaveLength(2);

    await s.rebuild();
    expect(await s.rows()).toEqual([]);
  });

  test("a pair whose member vanished before the write is skipped", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    await s.t.run((ctx) => ctx.db.delete(b));
    await s.t.mutation(internal.memberPairSuggestions.writePairs, {
      builtAt: Date.now(),
      pairs: [{ memberA: a, memberB: b }],
    });
    expect(await s.rows()).toEqual([]);
  });

  test("without a Role field, members carry no role", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.delete(s.roleField));
    await s.onCampus("Hana Doe", { [s.roleField]: "member" });
    await s.onCampus("Hana Doe", { [s.roleField]: "member" });
    await s.rebuild();
    const listed = await s.admin.query(api.memberPairSuggestions.list, {});
    expect(listed).toHaveLength(1);
    expect(listed![0].a.role).toBeUndefined();
  });

  test("only admins see or dismiss pairs, and a pair needs two living members", async () => {
    const s = await setup();
    const a = await s.onCampus("Hana Doe");
    const b = await s.onCampus("Hana Doe");
    expect(await s.t.query(api.memberPairSuggestions.list, {})).toBeNull();
    await expect(s.leader.query(api.memberPairSuggestions.list, {})).rejects.toThrow(
      /Only admins/
    );
    await expect(
      s.leader.mutation(api.memberPairSuggestions.dismiss, { memberA: a, memberB: b })
    ).rejects.toThrow(/Only admins/);
    await expect(
      s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: a, memberB: a })
    ).rejects.toThrow(/two different people/);
    await s.t.run((ctx) => ctx.db.delete(b));
    await expect(
      s.admin.mutation(api.memberPairSuggestions.dismiss, { memberA: a, memberB: b })
    ).rejects.toThrow(/no longer exists/);
  });

  test("the nightly metrics build schedules the pair build", async () => {
    const s = await setup();
    await s.t.mutation(internal.attendanceMetrics.recomputeAll, {});
    const names = await s.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name)
    );
    expect(names.filter((n) => n === "memberPairSuggestions:rebuild")).toHaveLength(1);
  });
});
