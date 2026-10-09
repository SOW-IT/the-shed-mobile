/// <reference types="vite/client" />
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
const HANA = "hana.doe@sow.org.au";
const ALEX = "alexander.morgan@sow.org.au";
const USYD = "University of Sydney";
const UNSW = "University of New South Wales";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const { campusField, roleField } = await t.run(async (ctx) => {
    const staff = (
      email: string,
      name: string,
      year: number,
      assignments: { role: string; university?: string; department?: string }[]
    ) => ctx.db.insert("staffProfiles", { email, name, year, assignments });
    await staff(LEADER, "Lee Der", YEAR, [{ role: "Student Leader", university: USYD }]);
    await staff(HANA, "Hana Doe", YEAR, [{ role: "Student Leader", university: USYD }]);
    await staff(ALEX, "Alexander Morgan", YEAR, [
      { role: "Staff", department: "Marketing" },
    ]);
    // Staff last year only: their staff row is never someone's duplicate.
    await staff("hana.doe2@sowaustralia.com", "Hana Doe", YEAR - 1, [
      { role: "Student Leader", university: USYD },
    ]);
    // Staff from next year only: not suggested until their year starts.
    await staff("mia.doe@sow.org.au", "Mia Doe", YEAR + 1, [
      { role: "Student Leader", university: USYD },
    ]);
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
  const signIn = async (memberId: Id<"attendanceMembers">, signInTime: number) => {
    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", {
        name: `Weekly ${signInTime}`,
        dateStart: signInTime,
        dateEnd: signInTime + 1,
        subgroups: [],
      })
    );
    await t.run((ctx) =>
      ctx.db.insert("attendance", { eventId, memberId, signInTime })
    );
  };
  return {
    t,
    admin: asUser(t, ADMIN),
    leader: asUser(t, LEADER),
    campusField,
    roleField,
    member,
    signIn,
  };
}

describe("suggested merges", () => {
  test("lists staff who look like a member on a matching campus", async () => {
    const s = await setup();
    const hana = await s.member("Hana Doe", { [s.campusField]: "usyd" });
    await s.signIn(hana, 5_000);
    await s.signIn(hana, 9_000);
    const hanaNoCampus = await s.member("hana  doe");
    await s.member("Hana Doe", { [s.campusField]: "unsw" }); // another campus
    await s.member("Hana Doerr", { [s.campusField]: "usyd" }); // another name
    await s.member("Hana Doe", {}, HANA); // their own staff row
    await s.member("Hana Doe", {}, "hana.doe2@sow.org.au"); // last year's staff
    await s.member("Mia Doe", { [s.campusField]: "usyd" }); // next year's staff
    const alex = await s.member("Alex Morgan", {
      [s.campusField]: "usyd",
      [s.roleField]: "member",
    });
    const alexTyped = await s.member("Alexander Morgan", { [s.roleField]: "Leader" });

    const suggestions = await s.admin.query(api.mergeSuggestions.list, {});

    expect(suggestions).toEqual([
      {
        staffEmail: ALEX,
        staffName: "Alexander Morgan",
        roles: ["Staff"],
        universities: [],
        candidates: [
          expect.objectContaining({ memberId: alexTyped, match: "same", role: "Leader" }),
          expect.objectContaining({
            memberId: alex,
            match: "short",
            campus: USYD,
            role: "Member",
          }),
        ],
      },
      {
        staffEmail: HANA,
        staffName: "Hana Doe",
        roles: ["Student Leader"],
        universities: [USYD],
        candidates: [
          {
            memberId: hana,
            name: "Hana Doe",
            email: undefined,
            campus: USYD,
            role: undefined,
            match: "same",
            signIns: 2,
            lastSignIn: 9_000,
          },
          {
            memberId: hanaNoCampus,
            name: "hana  doe",
            email: undefined,
            campus: undefined,
            role: undefined,
            match: "same",
            signIns: 0,
            lastSignIn: null,
          },
        ],
      },
    ]);
  });

  test("one member can be suggested for two staff with the same name", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "hana.doe3@sow.org.au",
        name: "Hana Doe3",
        year: YEAR,
        assignments: [{ role: "Student Leader", university: USYD }],
      })
    );
    const hana = await s.member("Hana Doe", { [s.campusField]: "usyd" });
    await s.signIn(hana, 5_000);

    const suggestions = await s.admin.query(api.mergeSuggestions.list, {});

    expect(suggestions?.map((x) => [x.staffEmail, x.candidates])).toEqual(
      [HANA, "hana.doe3@sow.org.au"].map((email) => [
        email,
        [expect.objectContaining({ memberId: hana, signIns: 1, lastSignIn: 5_000 })],
      ])
    );
  });

  test("a merged or dismissed pair stops being suggested", async () => {
    const s = await setup();
    const hana = await s.member("Hana Doe", { [s.campusField]: "usyd" });
    await s.signIn(hana, 5_000);
    const alex = await s.member("Alex Morgan");

    await s.admin.mutation(api.attendanceMembers.merge, {
      removeId: hana,
      keep: { staffEmail: HANA },
      resolutions: {},
      staffYear: YEAR,
    });
    await s.admin.mutation(api.mergeSuggestions.dismiss, {
      staffEmail: " Alexander.Morgan@sowaustralia.com ",
      memberId: alex,
    });
    // Saying it twice is harmless.
    await s.admin.mutation(api.mergeSuggestions.dismiss, { staffEmail: ALEX, memberId: alex });

    expect(await s.admin.query(api.mergeSuggestions.list, {})).toEqual([]);
    const { dismissals, audit } = await s.t.run(async (ctx) => ({
      dismissals: await ctx.db.query("mergeSuggestionDismissals").collect(),
      audit: await ctx.db
        .query("attendanceAuditLog")
        .filter((q) => q.eq(q.field("action"), "member.notSame"))
        .collect(),
    }));
    expect(dismissals).toEqual([
      expect.objectContaining({ staffEmail: ALEX, memberId: alex, dismissedBy: ADMIN }),
    ]);
    expect(audit).toEqual([
      expect.objectContaining({
        actorEmail: ADMIN,
        memberId: alex,
        summary: `Marked "Alex Morgan" as not the same person as staff "Alexander Morgan"`,
        subjectEmail: ALEX,
      }),
    ]);
  });

  test("only admins see or dismiss suggestions", async () => {
    const s = await setup();
    const alex = await s.member("Alex Morgan");
    expect(await s.t.query(api.mergeSuggestions.list, {})).toBeNull();
    await expect(s.leader.query(api.mergeSuggestions.list, {})).rejects.toThrow(
      /Only admins/
    );
    await expect(
      s.leader.mutation(api.mergeSuggestions.dismiss, { staffEmail: ALEX, memberId: alex })
    ).rejects.toThrow(/Only admins/);
  });

  test("dismissing needs a staff person and a member that still exist", async () => {
    const s = await setup();
    const alex = await s.member("Alex Morgan");
    await expect(
      s.admin.mutation(api.mergeSuggestions.dismiss, { staffEmail: "nobody@sow.org.au", memberId: alex })
    ).rejects.toThrow(/Staff profile not found/);
    await s.t.run((ctx) => ctx.db.delete(alex));
    await expect(
      s.admin.mutation(api.mergeSuggestions.dismiss, { staffEmail: ALEX, memberId: alex })
    ).rejects.toThrow(/no longer exists/);
  });

  test("without a Role field, members carry no role", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.delete(s.roleField));
    await s.member("Alex Morgan", { [s.roleField]: "member" });
    const suggestions = await s.admin.query(api.mergeSuggestions.list, {});
    expect(suggestions?.[0].candidates[0].role).toBeUndefined();
  });
});
