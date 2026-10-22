/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { linkUserProfiles } from "./userLink";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const MACQ = "Macquarie University";

const ADMIN = "admin@sow.org.au";
const HANA = "hana@sow.org.au";
const CARA = "cara@sow.org.au";
const COLIN = "colin@sow.org.au";
const SAM = "sam@sow.org.au";
const SID = "sid@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  for (const profile of [
    { email: HANA, roles: ["Staff"], department: "People and Culture" },
    { email: CARA, roles: ["Student Leader"], university: MACQ },
    { email: COLIN, roles: ["President"], university: MACQ },
    { email: SAM, roles: ["Staff"], department: "Marketing" },
    { email: SID, roles: ["Staff"], department: "Marketing" },
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...profile });
  }
  await t.run(async (ctx) => {
    for (const [email, name] of [
      [CARA, "Cara Chen"],
      [COLIN, "Colin Cho"],
      [SAM, "Sam Smith"],
      [SID, "Sid Singh"],
      [HANA, "Hana Han"],
    ]) {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
        .unique();
      await ctx.db.patch("staffProfiles", profile!._id, { name });
    }
  });
  return { t, admin };
}

const profileIn = (ctx: MutationCtx, email: string) =>
  ctx.db
    .query("staffProfiles")
    .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", YEAR))
    .unique();

describe("access", () => {
  test("signed-out callers get null", async () => {
    const { t } = await setup();
    expect(await t.query(api.mentoring.pairings, { year: YEAR })).toBeNull();
    expect(await t.query(api.mentoring.candidates, { year: YEAR })).toBeNull();
    expect(await t.query(api.mentoring.externalMentors, {})).toBeNull();
    expect(await t.query(api.mentoring.myMentees, {})).toBeNull();
  });

  test("only admins see pairings; the HR division counts as admin", async () => {
    const { t } = await setup();
    await expect(asUser(t, SAM).query(api.mentoring.pairings, { year: YEAR })).rejects.toThrow(
      "Only admins"
    );
    await expect(
      asUser(t, SAM).mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: CARA,
        mentor: { kind: "leader", email: SID },
      })
    ).rejects.toThrow("Only admins");
    const hr = await asUser(t, HANA).query(api.mentoring.pairings, { year: YEAR });
    expect(hr).toEqual({ year: YEAR, editable: true, pairs: [] });
  });
});

describe("candidates", () => {
  test("splits Campus leaders from everyone else and says who already has a mentor", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: COLIN,
      mentor: { kind: "leader", email: SAM },
    });
    const result = (await admin.query(api.mentoring.candidates, { year: YEAR }))!;
    expect(result.campusLeaders).toEqual([
      { email: CARA, name: "Cara Chen", line: "Student Leader → MACQ", mentoredBy: null },
      { email: COLIN, name: "Colin Cho", line: "President → MACQ", mentoredBy: "Sam Smith" },
    ]);
    expect(result.leaders.map((l) => l.email)).toEqual([ADMIN, HANA, SAM, SID]);
    expect(result.leaders.find((l) => l.email === SAM)?.line).toBe("Staff → Marketing");
    expect(result.externals).toEqual([]);
    await t.run(async (ctx) => {
      const sam = await profileIn(ctx, SAM);
      await ctx.db.patch("staffProfiles", sam!._id, { name: undefined });
    });
    const unnamed = (await admin.query(api.mentoring.candidates, { year: YEAR }))!;
    expect(unnamed.campusLeaders[1].mentoredBy).toBe(SAM);
  });

  test("an external mentor's name shows as the mentor, or a fallback once deleted", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, { name: "Pastor Paul" });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "external", id },
    });
    let result = (await admin.query(api.mentoring.candidates, { year: YEAR }))!;
    expect(result.campusLeaders[0].mentoredBy).toBe("Pastor Paul");
    expect(result.externals).toEqual([{ id, name: "Pastor Paul", email: null }]);
    await t.run((ctx) => ctx.db.delete("externalMentors", id));
    result = (await admin.query(api.mentoring.candidates, { year: YEAR }))!;
    expect(result.campusLeaders[0].mentoredBy).toBe("an external mentor");
  });
});

describe("setMentor", () => {
  test("pairs a Campus leader with a leader, then overwrites the mentor", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: " CARA@sow.org.au ",
      mentor: { kind: "leader", email: SAM },
    });
    let list = (await admin.query(api.mentoring.pairings, { year: YEAR }))!;
    expect(list.pairs).toHaveLength(1);
    expect(list.pairs[0]).toMatchObject({
      id,
      mentee: { email: CARA, name: "Cara Chen", line: "Student Leader → MACQ", warning: null },
      mentor: { kind: "leader", email: SAM, name: "Sam Smith", line: "Staff → Marketing", warning: null },
      imported: false,
      updatedBy: ADMIN,
    });

    const again = await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SID },
    });
    expect(again).toBe(id);
    list = (await admin.query(api.mentoring.pairings, { year: YEAR }))!;
    expect(list.pairs).toHaveLength(1);
    expect(list.pairs[0].mentor.email).toBe(SID);
    expect((await asUser(t, SID).query(api.directory.me, {}))?.isMentor).toBe(true);
    expect((await asUser(t, SAM).query(api.directory.me, {}))?.isMentor).toBe(false);
  });

  test("sorts pairings by mentee name and shows who changed them", async () => {
    const { t, admin } = await setup();
    await asUser(t, HANA).mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: COLIN,
      mentor: { kind: "leader", email: SAM },
    });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SAM },
    });
    const list = (await admin.query(api.mentoring.pairings, { year: YEAR }))!;
    expect(list.pairs.map((p) => [p.mentee.name, p.updatedBy])).toEqual([
      ["Cara Chen", ADMIN],
      ["Colin Cho", "Hana Han"],
    ]);
  });

  test("rejects mentees who aren't Campus leaders and Campus leader mentors", async () => {
    const { admin } = await setup();
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: SAM,
        mentor: { kind: "leader", email: SID },
      })
    ).rejects.toThrow(`${SAM} isn't a Campus leader in ${YEAR}.`);
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: "nobody@sow.org.au",
        mentor: { kind: "leader", email: SID },
      })
    ).rejects.toThrow("isn't a Campus leader");
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: CARA,
        mentor: { kind: "leader", email: COLIN },
      })
    ).rejects.toThrow("Campus leaders can't mentor other Campus leaders.");
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: CARA,
        mentor: { kind: "leader", email: "outsider@gmail.com" },
      })
    ).rejects.toThrow("Add them as an external mentor instead.");
  });

  test("only the current and next year can change", async () => {
    const { admin } = await setup();
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR - 1,
        menteeEmail: CARA,
        mentor: { kind: "leader", email: SAM },
      })
    ).rejects.toThrow(`You can only manage ${YEAR} and ${YEAR + 1}.`);
  });

  test("a deleted external mentor can't be picked", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, { name: "Gone" });
    await t.run((ctx) => ctx.db.delete("externalMentors", id));
    await expect(
      admin.mutation(api.mentoring.setMentor, {
        year: YEAR,
        menteeEmail: CARA,
        mentor: { kind: "external", id },
      })
    ).rejects.toThrow("That external mentor was deleted.");
  });
});

describe("warnings", () => {
  test("flag mentees and mentors who no longer qualify, in editable years only", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SAM },
    });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: COLIN,
      mentor: { kind: "leader", email: SID },
    });
    await t.run(async (ctx) => {
      await ctx.db.delete("staffProfiles", (await profileIn(ctx, CARA))!._id);
      await ctx.db.delete("staffProfiles", (await profileIn(ctx, SAM))!._id);
      await ctx.db.patch("staffProfiles", (await profileIn(ctx, COLIN))!._id, {
        assignments: [{ role: "Staff", department: "Marketing" }],
      });
      await ctx.db.patch("staffProfiles", (await profileIn(ctx, SID))!._id, {
        assignments: [{ role: "Student Leader", university: MACQ }],
      });
    });
    const list = (await admin.query(api.mentoring.pairings, { year: YEAR }))!;
    const byMentee = new Map(list.pairs.map((p) => [p.mentee.email, p]));
    expect(byMentee.get(CARA)?.mentee).toMatchObject({ warning: "No longer a leader", line: null });
    expect(byMentee.get(CARA)?.mentor).toMatchObject({
      warning: "Mentor is no longer a leader",
      line: null,
    });
    expect(byMentee.get(COLIN)?.mentee.warning).toBe("No longer a Campus leader");
    expect(byMentee.get(COLIN)?.mentor.warning).toBe("Mentor is now a Campus leader");
  });

  test("past years are read-only and never warn", async () => {
    const { t, admin } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("mentorships", {
        year: YEAR - 1,
        menteeEmail: "old@sow.org.au",
        mentorEmail: "older@sow.org.au",
        updatedBy: "legacy-import",
        updatedAt: 1,
        legacyKey: `${YEAR - 1}/uid-old`,
      })
    );
    const list = (await admin.query(api.mentoring.pairings, { year: YEAR - 1 }))!;
    expect(list.editable).toBe(false);
    expect(list.pairs[0]).toMatchObject({
      mentee: { email: "old@sow.org.au", name: "old@sow.org.au", warning: null },
      mentor: { kind: "leader", warning: null },
      imported: true,
      updatedBy: null,
    });
  });
});

describe("removePairing", () => {
  test("removes a pairing, ignores a missing one and refuses past years", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SAM },
    });
    expect(await admin.mutation(api.mentoring.removePairing, { id })).toBeNull();
    expect((await admin.query(api.mentoring.pairings, { year: YEAR }))!.pairs).toEqual([]);
    expect(await admin.mutation(api.mentoring.removePairing, { id })).toBeNull();
    const old = await t.run((ctx) =>
      ctx.db.insert("mentorships", {
        year: YEAR - 1,
        menteeEmail: CARA,
        mentorEmail: SAM,
        updatedBy: ADMIN,
        updatedAt: 1,
      })
    );
    await expect(admin.mutation(api.mentoring.removePairing, { id: old })).rejects.toThrow(
      "You can only manage"
    );
  });
});

describe("external mentors", () => {
  test("are saved cleaned up, edited in place and used as mentors", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, {
      name: "  Pastor   Paul ",
      email: " Paul@Church.org ",
      phone: " 0400 000 000 ",
      notes: "  ",
    });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "external", id },
    });
    await t.run((ctx) =>
      ctx.db.insert("mentorships", {
        year: YEAR - 2,
        menteeEmail: COLIN,
        externalMentorId: id,
        updatedBy: ADMIN,
        updatedAt: 1,
      })
    );
    let list = (await admin.query(api.mentoring.externalMentors, {}))!;
    expect(list).toEqual([
      {
        id,
        name: "Pastor Paul",
        email: "paul@church.org",
        phone: "0400 000 000",
        notes: null,
        pairingCount: 2,
        years: [YEAR, YEAR - 2],
      },
    ]);
    const pairs = (await admin.query(api.mentoring.pairings, { year: YEAR }))!.pairs;
    expect(pairs[0].mentor).toMatchObject({
      kind: "external",
      id,
      name: "Pastor Paul",
      line: "paul@church.org",
      photo: null,
      warning: null,
    });

    await admin.mutation(api.mentoring.saveExternalMentor, {
      id,
      name: "Paul Park",
      phone: "0411 111 111",
      notes: "Meets monthly",
    });
    list = (await admin.query(api.mentoring.externalMentors, {}))!;
    expect(list[0]).toMatchObject({
      name: "Paul Park",
      email: null,
      phone: "0411 111 111",
      notes: "Meets monthly",
    });
    const updated = (await admin.query(api.mentoring.pairings, { year: YEAR }))!.pairs;
    expect(updated[0].mentor.line).toBe("0411 111 111");
  });

  test("need a name and a valid, unused email", async () => {
    const { admin } = await setup();
    await expect(admin.mutation(api.mentoring.saveExternalMentor, { name: " " })).rejects.toThrow(
      "Enter their name."
    );
    await expect(
      admin.mutation(api.mentoring.saveExternalMentor, { name: "X", email: "nope" })
    ).rejects.toThrow("Enter a valid email");
    const first = await admin.mutation(api.mentoring.saveExternalMentor, {
      name: "Pastor Paul",
      email: "paul@church.org",
    });
    await expect(
      admin.mutation(api.mentoring.saveExternalMentor, {
        name: "Someone Else",
        email: "PAUL@church.org",
      })
    ).rejects.toThrow("Pastor Paul already uses paul@church.org.");
    expect(
      await admin.mutation(api.mentoring.saveExternalMentor, {
        id: first,
        name: "Pastor Paul",
        email: "paul@church.org",
      })
    ).toBe(first);
  });

  test("are listed by name, here and in the mentor picker", async () => {
    const { admin } = await setup();
    await admin.mutation(api.mentoring.saveExternalMentor, { name: "Zoe Zhang" });
    await admin.mutation(api.mentoring.saveExternalMentor, { name: "Ann Abbott" });
    const list = (await admin.query(api.mentoring.externalMentors, {}))!;
    expect(list.map((e) => e.name)).toEqual(["Ann Abbott", "Zoe Zhang"]);
    const picker = (await admin.query(api.mentoring.candidates, { year: YEAR }))!;
    expect(picker.externals.map((e) => e.name)).toEqual(["Ann Abbott", "Zoe Zhang"]);
  });

  test("can't be edited once deleted", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, { name: "Gone" });
    await t.run((ctx) => ctx.db.delete("externalMentors", id));
    await expect(
      admin.mutation(api.mentoring.saveExternalMentor, { id, name: "Back" })
    ).rejects.toThrow("That external mentor was deleted.");
  });

  test("can only be deleted when no pairing uses them", async () => {
    const { admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, { name: "Pastor Paul" });
    const pairing = await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "external", id },
    });
    await expect(admin.mutation(api.mentoring.removeExternalMentor, { id })).rejects.toThrow(
      "Pastor Paul is in 1 pairing, so they can't be deleted."
    );
    await admin.mutation(api.mentoring.removePairing, { id: pairing });
    expect(await admin.mutation(api.mentoring.removeExternalMentor, { id })).toBeNull();
    expect(await admin.query(api.mentoring.externalMentors, {})).toEqual([]);
    expect(await admin.mutation(api.mentoring.removeExternalMentor, { id })).toBeNull();
  });

  test("a pairing whose external mentor vanished still lists", async () => {
    const { t, admin } = await setup();
    const id = await admin.mutation(api.mentoring.saveExternalMentor, { name: "Gone" });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "external", id },
    });
    await t.run((ctx) => ctx.db.delete("externalMentors", id));
    const pairs = (await admin.query(api.mentoring.pairings, { year: YEAR }))!.pairs;
    expect(pairs[0].mentor).toMatchObject({ name: "Deleted external mentor", email: null, line: null });
  });
});

describe("myMentees", () => {
  test("a mentor sees only their own current-year mentees", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: COLIN,
      mentor: { kind: "leader", email: SAM },
    });
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SAM },
    });
    const mine = (await asUser(t, SAM).query(api.mentoring.myMentees, {}))!;
    expect(mine.year).toBe(YEAR);
    expect(mine.mentees.map((m) => [m.name, m.line])).toEqual([
      ["Cara Chen", "Student Leader → MACQ"],
      ["Colin Cho", "President → MACQ"],
    ]);
    expect((await asUser(t, SID).query(api.mentoring.myMentees, {}))!.mentees).toEqual([]);
  });

  test("a mentee who has left shows by email", async () => {
    const { t, admin } = await setup();
    await admin.mutation(api.mentoring.setMentor, {
      year: YEAR,
      menteeEmail: CARA,
      mentor: { kind: "leader", email: SAM },
    });
    await t.run(async (ctx) => {
      await ctx.db.delete("staffProfiles", (await profileIn(ctx, CARA))!._id);
      await ctx.db.insert("users", { email: CARA, name: "Cara From Google" });
    });
    const mine = (await asUser(t, SAM).query(api.mentoring.myMentees, {}))!;
    expect(mine.mentees[0]).toMatchObject({ name: "Cara From Google", line: null });
    await t.run(async (ctx) => {
      await ctx.db.insert("directoryUsers", { email: CARA, name: "Cara Directory" });
    });
    const again = (await asUser(t, SAM).query(api.mentoring.myMentees, {}))!;
    expect(again.mentees[0].name).toBe("Cara Directory");
  });
});

describe("relinking an email", () => {
  test("moves mentee and mentor rows to the new address", async () => {
    const { t } = await setup();
    const OLD = "sam.old@sow.org.au";
    const userId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: SAM, name: "Sam Smith" });
      await ctx.db.insert("staffProfiles", { email: OLD, year: YEAR - 1, userId: id });
      const insert = (menteeEmail: string, mentorEmail: string, year = YEAR - 1) =>
        ctx.db.insert("mentorships", {
          year,
          menteeEmail,
          mentorEmail,
          updatedBy: ADMIN,
          updatedAt: 1,
        });
      await insert(OLD, SID);
      await insert(CARA, OLD);
      await insert(SAM, OLD, YEAR - 2);
      await insert(OLD, SAM, YEAR - 2);
      await insert(OLD, SID, YEAR - 3);
      await insert(SAM, CARA, YEAR - 3);
      return id;
    });
    await t.run((ctx) => linkUserProfiles(ctx, userId));
    const rows = await t.run((ctx) => ctx.db.query("mentorships").take(20));
    expect(
      rows.map((r) => [r.year, r.menteeEmail, r.mentorEmail]).sort((a, b) => String(a).localeCompare(String(b)))
    ).toEqual(
      [
        [YEAR - 1, SAM, SID],
        [YEAR - 1, CARA, SAM],
        [YEAR - 3, SAM, CARA],
      ].sort((a, b) => String(a).localeCompare(String(b)))
    );
  });
});
