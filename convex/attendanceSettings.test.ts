/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// Pinned mid staff year (still ticking) so dates a few weeks either side of
// "now" never straddle the 1 October rollover (see ADR 0003).
const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * 86_400_000;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});
const YEAR = staffYearForDate(new Date(PINNED_NOW));

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const STAFF = "staff@sow.org.au";
const OUTSIDER = "outsider@sow.org.au";

const USYD = "University of Sydney";
const MACQ = "Macquarie University";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: MACQ });
  await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Missions",
    division: "Ministry",
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  await admin.mutation(api.admin.setStaffProfile, {
    email: STAFF,
    year: YEAR,
    roles: ["Staff"],
    department: "Missions",
  });
  return t;
}

const window = () => ({ dateStart: Date.now(), dateEnd: Date.now() + 3600_000 });

describe("Campus locked options across the staff-year rollover", () => {
  test("a university from the previous staff year stays locked", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const UOW = "University of Wollongong";
    await t.run(async (ctx) => {
      await ctx.db.insert("universities", { year: YEAR - 1, name: UOW });
    });
    await admin.mutation(api.attendanceMetadata.ensureDefaults, {});

    const campus = (await admin.query(api.attendanceMetadata.list, {})).find(
      (f) => f.key === "Campus"
    )!;
    expect(Object.values(campus.values ?? {})).toContain(UOW);
    expect(campus.lockedValues).toContain(UOW);
    expect(campus.lockedValues).toContain(USYD);
    expect(campus.lockedValues).toContain(MACQ);
  });

  test("a campus in neither year is a custom option, not a locked one", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.attendanceMetadata.ensureDefaults, {});
    const campus = (await admin.query(api.attendanceMetadata.list, {})).find(
      (f) => f.key === "Campus"
    )!;
    await admin.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: campus._id,
          key: "Campus",
          type: "select",
          order: campus.order,
          values: { ...campus.values, "90": "Online" },
          lockedValues: campus.lockedValues,
        },
      ],
      deleteIds: [],
    });

    const updated = (await admin.query(api.attendanceMetadata.list, {})).find(
      (f) => f.key === "Campus"
    )!;
    expect(Object.values(updated.values ?? {})).toContain("Online");
    expect(updated.lockedValues).not.toContain("Online");
  });
});

describe("attendance tags (branch coverage)", () => {
  test("plain staff cannot manage shared attendance settings", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    await expect(
      staff.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "Retreat" }],
        deleteIds: [],
      })
    ).rejects.toThrow(/admins or campus leaders/i);
    await expect(
      staff.mutation(api.attendanceMetadata.ensureDefaults, {})
    ).resolves.toBe(0);
    expect(
      await t.run((ctx) => ctx.db.query("attendanceMetadata").collect())
    ).toEqual([]);
    await expect(
      staff.mutation(api.attendanceMetadata.saveAll, { fields: [], deleteIds: [] })
    ).rejects.toThrow(/admins or campus leaders/i);
  });

  test("updating a tag with subgroups stores the normalised subgroup list", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Retreat", colour: "purple" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tag._id, name: "Retreat", colour: "purple", subgroups: [USYD, "ALL"] }],
      deleteIds: [],
    });
    const [updated] = await leader.query(api.attendanceTags.list, {});
    expect(updated.subgroups).toContain(USYD);
  });

  test("a weekly tag never applies to SOW, which has no weeklies", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [
        { name: "Retreat", colour: "purple", subgroups: ["SOW", USYD] },
        { name: "BAM", colour: "orange", list: "weeklies", subgroups: ["SOW", USYD] },
      ],
      deleteIds: [],
    });
    const byName = async () =>
      new Map((await leader.query(api.attendanceTags.list, {})).map((tag) => [tag.name, tag]));
    let tags = await byName();
    expect(tags.get("Retreat")!.subgroups).toEqual(["SOW", USYD]);
    expect(tags.get("BAM")!.subgroups).toEqual([USYD]);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tags.get("Retreat")!._id, name: "Retreat", colour: "purple", list: "weeklies", subgroups: ["ALL"] }],
      deleteIds: [],
    });
    tags = await byName();
    expect(tags.get("Retreat")).toMatchObject({ list: "weeklies" });
    expect(tags.get("Retreat")!.subgroups).toBeUndefined();
  });

  test("deleteIds skips tags that don't exist", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Keep", colour: "blue" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [],
      deleteIds: [tag._id],
    });
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [],
        deleteIds: [tag._id],
      })
    ).resolves.toBeNull();
  });
});

describe("attendance tags", () => {
  test("list is staff-only and sorted by name", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Zeta", colour: "blue" }, { name: "Alpha", colour: "red" }],
      deleteIds: [],
    });
    expect(await t.query(api.attendanceTags.list, {})).toEqual([]);
    const tags = await leader.query(api.attendanceTags.list, {});
    expect(tags.map((tag) => tag.name)).toEqual(["Alpha", "Zeta"]);
  });

  test("saveAll updates, deletes, and validates names", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Social", colour: "green" }],
      deleteIds: [],
    });
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tag._id, name: "Social Night", colour: "teal" }],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceTags.list, {}))[0].name
    ).toBe("Social Night");
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [],
      deleteIds: [tag._id],
    });
    expect(await leader.query(api.attendanceTags.list, {})).toEqual([]);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "   " }],
        deleteIds: [],
      })
    ).rejects.toThrow(/needs a name/i);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "Dup" }, { name: "dup" }],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate tag/i);
  });

  test("inserting a name that already exists in the catalogue is rejected", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Retreat", colour: "purple" }],
      deleteIds: [],
    });
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "retreat" }],
        deleteIds: [],
      })
    ).rejects.toThrow('Other events already has a tag named "retreat".');
    const [tag] = await leader.query(api.attendanceTags.list, {});
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: tag._id, name: "Retreat", colour: "teal" }],
      deleteIds: [],
    });
    const [updated] = await leader.query(api.attendanceTags.list, {});
    expect(updated.colour).toBe("teal");
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Retreat", colour: "red" }],
      deleteIds: [tag._id],
    });
    const after = await leader.query(api.attendanceTags.list, {});
    expect(after).toHaveLength(1);
    expect(after[0].colour).toBe("red");
  });
});

describe("attendance tags in two lists", () => {
  const listed = async (t: TestConvex<typeof schema>) =>
    (await asUser(t, LEADER).query(api.attendanceTags.list, {})).map((tag) => `${tag.list ?? "-"}:${tag.name}`);

  test("new tags go in Other events unless they say Weeklies", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Social" }, { name: "BAM", list: "weeklies" }, { name: "Retreat", list: "events" }],
      deleteIds: [],
    });
    expect(await listed(t)).toEqual(["weeklies:BAM", "events:Retreat", "events:Social"]);
  });

  test("a name is unique within a list, but both lists can have it", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "PPN", list: "events" }, { name: "ppn", list: "weeklies" }],
      deleteIds: [],
    });
    expect(await listed(t)).toEqual(["weeklies:ppn", "events:PPN"]);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ name: "Mega", list: "weeklies" }, { name: "MEGA", list: "weeklies" }],
        deleteIds: [],
      })
    ).rejects.toThrow('Duplicate tag "MEGA" in Weeklies.');
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: "Social" }, { name: "social" }], deleteIds: [] })
    ).rejects.toThrow('Duplicate tag "social" in Other events.');
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: " PPN ", list: "weeklies" }], deleteIds: [] })
    ).rejects.toThrow('Weeklies already has a tag named "PPN".');
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: "PPN" }], deleteIds: [] })
    ).rejects.toThrow('Other events already has a tag named "PPN".');
  });

  test("a saved tag sent without a list stays in its list", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Games Night", list: "weeklies" }, { name: "Games Night" }],
      deleteIds: [],
    });
    const tags = await leader.query(api.attendanceTags.list, {});
    const weekly = tags.find((tag) => tag.list === "weeklies")!;
    const event = tags.find((tag) => tag.list === "events")!;
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [
        { id: weekly._id, name: "Games Night", colour: "cyan" },
        { id: event._id, name: "Games Night" },
      ],
      deleteIds: [],
    });
    const saved = await t.run((ctx) => ctx.db.get(weekly._id));
    expect(saved).toMatchObject({ list: "weeklies", colour: "cyan" });
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: event._id, name: "Party", list: "weeklies" }],
      deleteIds: [],
    });
    expect(await listed(t)).toEqual(["weeklies:Games Night", "weeklies:Party"]);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ id: event._id, name: "Games Night" }],
        deleteIds: [],
      })
    ).rejects.toThrow('Weeklies already has a tag named "Games Night".');
  });

  test("a tag saved before lists existed counts as Other events", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const old = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Seasons" }));
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: "seasons", list: "events" }], deleteIds: [] })
    ).rejects.toThrow(/Other events already has/);
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ id: old, name: "Seasons" }], deleteIds: [] });
    expect((await t.run((ctx) => ctx.db.get(old)))!.list).toBeUndefined();
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: "Seasons", list: "weeklies" }], deleteIds: [] });
    expect(await listed(t)).toEqual(["-:Seasons", "weeklies:Seasons"]);
  });

  test("the Weeklies tag can't be renamed or deleted", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const weeklies = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Weeklies" }));
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [], deleteIds: [weeklies] })
    ).rejects.toThrow("The Weeklies tag can't be deleted; every weekly gets it.");
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ id: weeklies, name: "Weekly" }], deleteIds: [] })
    ).rejects.toThrow("The Weeklies tag can't be renamed; every weekly gets it.");
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ id: weeklies, name: "Weeklies", colour: "amber" }],
      deleteIds: [],
    });
    expect(await t.run((ctx) => ctx.db.get(weeklies))).toMatchObject({ name: "Weeklies", colour: "amber" });
    expect(await t.run((ctx) => ctx.db.query("attendanceTags").collect())).toHaveLength(1);
  });

  test("a tag named Weekly Meeting is an ordinary tag", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const old = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Weekly Meeting" }));
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ id: old, name: "Weekly Catch-up" }], deleteIds: [] });
    expect(await t.run((ctx) => ctx.db.get(old))).toMatchObject({ name: "Weekly Catch-up" });
    await leader.mutation(api.attendanceTags.saveAll, { tags: [], deleteIds: [old] });
    expect(await t.run((ctx) => ctx.db.get(old))).toBeNull();
  });

  test("no other tag can take the Weeklies name, in either list", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const [, social] = await t.run(async (ctx) => [
      await ctx.db.insert("attendanceTags", { name: "Weeklies" }),
      await ctx.db.insert("attendanceTags", { name: "Social", list: "events" }),
    ]);
    await expect(
      leader.mutation(api.attendanceTags.saveAll, { tags: [{ name: "Weeklies", list: "weeklies" }], deleteIds: [] })
    ).rejects.toThrow('"Weeklies" is the automatic tag every weekly gets; pick another name.');
    await expect(
      leader.mutation(api.attendanceTags.saveAll, {
        tags: [{ id: social, name: "Weeklies", list: "weeklies" }],
        deleteIds: [],
      })
    ).rejects.toThrow('"Weeklies" is the automatic tag every weekly gets; pick another name.');
  });

  test("a tag both saved and deleted is just deleted", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const id = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Gone", list: "events" }));
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ id, name: "Gone" }], deleteIds: [id] });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  });
});

describe("attendance metadata", () => {
  test("ensureDefaults seeds Year/Gender/Campus/Role once", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { })).toBe(
      4
    );
    expect(await leader.mutation(api.attendanceMetadata.ensureDefaults, { })).toBe(
      4
    );
    const fields = await leader.query(api.attendanceMetadata.list, { });
    expect(fields.map((f) => f.key)).toEqual(["Year", "Gender", "Campus", "Role"]);
    const campusValues = Object.values(
      fields.find((f) => f.key === "Campus")?.values ?? {}
    );
    expect(campusValues).toContain(USYD);
    expect(campusValues).toContain(MACQ);
  });

  test("ensureDefaults merges custom roles from the current staff year", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    const leader = asUser(t, LEADER);
    expect(
      await leader.mutation(api.attendanceMetadata.ensureDefaults, { })
    ).toBe(4);
    const role = (await leader.query(api.attendanceMetadata.list, { })).find(
      (f) => f.key === "Role"
    );
    expect(Object.values(role?.values ?? {})).toContain("Volunteer");
  });

  test("renameNotesField makes the old Notes member field Other Information, once", async () => {
    const t = await setup();
    const notesId = await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", { key: "Notes", type: "input", order: 5 })
    );
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Noted Member", metadata: { [notesId]: "likes tea" } })
    );

    expect(await t.mutation(internal.attendanceMetadata.renameNotesField, {})).toBe("renamed");
    expect((await t.run((ctx) => ctx.db.get(notesId)))?.key).toBe("Other Information");
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.metadata).toEqual({ [notesId]: "likes tea" });
    const log = await t.run((ctx) =>
      ctx.db.query("attendanceAuditLog").filter((q) => q.eq(q.field("action"), "metadata.update")).first()
    );
    expect(log).toMatchObject({
      actorEmail: "system:notes-rename",
      summary: 'Renamed member field "Notes" to "Other Information"',
    });
    expect(await t.mutation(internal.attendanceMetadata.renameNotesField, {})).toBe("nothing to rename");

    await t.run((ctx) => ctx.db.insert("attendanceMetadata", { key: "notes", type: "input", order: 6 }));
    expect(await t.mutation(internal.attendanceMetadata.renameNotesField, {})).toBe("both exist");
  });

  test("list is staff-only and strips Gender Other but keeps Female", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    expect(await t.query(api.attendanceMetadata.list, { })).toEqual([]);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const gender = fields.find((f) => f.key === "Gender");
    expect(Object.values(gender?.values ?? {})).not.toContain("Other");
    expect(Object.values(gender?.values ?? {})).toContain("Female");
    expect(Object.values(gender?.values ?? {})).toContain("Male");
  });

  test("saveAll creates, patches, and guards locked values", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campus = fields.find((f) => f.key === "Campus")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: campus._id,
          key: "Campus",
          type: "select",
          order: 2,
          values: { ...campus.values, "10": "Online" },
          lockedValues: campus.lockedValues,
        },
        {
          key: "Notes",
          type: "input",
          order: 4,
        },
      ],
      deleteIds: [],
    });
    const updated = await leader.query(api.attendanceMetadata.list, { });
    // Notes about one event go on its sign-in, so a member field called
    // Notes is saved as Other Information.
    expect(updated.find((f) => f.key === "Notes")).toBeUndefined();
    expect(updated.find((f) => f.key === "Other Information")).toBeTruthy();
    expect(updated.find((f) => f.key === "Campus")?.values?.["10"]).toBe("Online");

    const gender = fields.find((f) => f.key === "Gender")!;

    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: gender._id,
          key: "Gender",
          type: "select",
          order: 1,
          values: { "2": "Female" },
          lockedValues: gender.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const withGender = await leader.query(api.attendanceMetadata.list, { });
    expect(withGender.find((f) => f.key === "Gender")?.values).toEqual({
      "1": "Male",
      "2": "Female",
    });

    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [
          { key: "Dup", type: "input", order: 5 },
          { key: "dup", type: "input", order: 6 },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate metadata field/i);

    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: updated
        .filter((f) => f.key !== "Other Information")
        .map((f) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: f.order,
          values: f.values,
          lockedValues: f.lockedValues,
        })),
      deleteIds: [updated.find((f) => f.key === "Other Information")!._id],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { })).some(
        (f) => f.key === "Other Information"
      )
    ).toBe(false);

    await asUser(t, ADMIN).mutation(api.admin.upsertUniversity, {
      year: YEAR,
      name: "Western Sydney University",
    });
    await asUser(t, ADMIN).mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Volunteer",
    });
    const afterUni = await leader.query(api.attendanceMetadata.list, { });
    expect(
      Object.values(afterUni.find((f) => f.key === "Campus")?.values ?? {})
    ).toContain("Western Sydney University");
    const roleField = afterUni.find((f) => f.key === "Role")!;
    expect(Object.values(roleField.values ?? {})).toContain("Volunteer");
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: roleField._id,
          key: "Role",
          type: "select",
          order: roleField.order,
          values: roleField.values,
          lockedValues: roleField.lockedValues,
        },
        {
          key: "Track",
          type: "select",
          order: 10,
          values: { "1": "Morning" },
          lockedValues: ["Morning"],
        },
      ],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { })).some(
        (f) => f.key === "Track"
      )
    ).toBe(true);

    const yearField = afterUni.find((f) => f.key === "Year")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: yearField._id,
          key: "Year",
          type: "select",
          order: yearField.order,
          values: yearField.values,
          lockedValues: yearField.lockedValues,
        },
        {
          key: "Comments",
          type: "input",
          order: 11,
        },
      ],
      deleteIds: [],
    });
    expect(
      (await leader.query(api.attendanceMetadata.list, { })).find(
        (f) => f.key === "Comments"
      )?.type
    ).toBe("input");

    const ghostId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMetadata", {
        key: "Ghost",
        type: "input",
        order: 99,
      });
      await ctx.db.delete(id);
      return id;
    });
    const before = await leader.query(api.attendanceMetadata.list, {});
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [],
      deleteIds: [ghostId],
    });
    expect(await leader.query(api.attendanceMetadata.list, {})).toHaveLength(
      before.length
    );
  });

  test("Role/Campus locked values stay synced to the roles/universities tables", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });

    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Temp Uni" });
    const seeded = await leader.query(api.attendanceMetadata.list, { });
    expect(seeded.find((f) => f.key === "Role")!.lockedValues).toContain("Volunteer");
    expect(seeded.find((f) => f.key === "Campus")!.lockedValues).toContain("Temp Uni");
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: seeded
        .filter((f) => f.key === "Role" || f.key === "Campus")
        .map((f) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: f.order,
          values: f.values,
          lockedValues: f.lockedValues,
        })),
      deleteIds: [],
    });

    await admin.mutation(api.admin.removeRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.removeUniversity, { year: YEAR, name: "Temp Uni" });

    const after = await leader.query(api.attendanceMetadata.list, { });
    const role = after.find((f) => f.key === "Role")!;
    const campus = after.find((f) => f.key === "Campus")!;
    expect(role.lockedValues).not.toContain("Volunteer");
    expect(role.lockedValues).toContain("Staff");
    expect(campus.lockedValues).not.toContain("Temp Uni");
    expect(campus.lockedValues).toContain(USYD);
  });
});

describe("attendance members", () => {
  test("optionIdForLabel fallback: campus not in field values returns the label", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Late Uni" });
    await admin.mutation(api.admin.setStaffProfile, {
      email: OUTSIDER,
      year: YEAR,
      roles: ["Student Leader"],
      university: "Late Uni",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(page.page.some((r) => r.email === OUTSIDER)).toBe(true);
  });

  test("staffLockedMetadata clears campus for staff with no campus assignment", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campusField = fields.find((f) => f.key === "Campus")!;
    const usydId = Object.entries(campusField.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: STAFF,
    });
    await t.run((ctx) =>
      ctx.db.patch(shadowId, { metadata: { [campusField._id]: usydId } })
    );
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const row = page.page.find((r) => r.email === STAFF);
    expect(row?.memberId).toBe(shadowId);
    expect(row?.metadata[campusField._id]).toBeUndefined();
  });

  test("list combines staff profiles with attendance-only members", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest Member",
      email: "guest@example.com",
    });
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(page.page.some((r) => r.key === `member:${memberId}`)).toBe(true);
    expect(page.page.some((r) => r.key === `staff:${LEADER}`)).toBe(true);
    expect(
      await t.query(api.attendanceMembers.list, {
        year: YEAR,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).toEqual({ page: [], isDone: true, continueCursor: "" });
  });

  test("dedupes an attendance-only member who later becomes staff, per year", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Future Leader",
      email: "future@gmail.com",
    });
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: OUTSIDER,
        year: YEAR,
        name: "Future Leader",
        assignments: [{ role: "Student Leader", university: USYD }],
        memberId,
      })
    );

    const thisYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = thisYear.page.find((r) => r.key === `staff:${OUTSIDER}`);
    expect(staffRow?.memberId).toBe(memberId);
    expect(staffRow?.personalEmail).toBe("future@gmail.com");
    expect(thisYear.page.some((r) => r.key === `member:${memberId}`)).toBe(false);

    const merged = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    expect(merged?.isStaffOverlay).toBe(true);
    expect(merged?.email).toBe(OUTSIDER);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Edited Name",
      email: "ignored@example.com",
      personalEmail: "edited@example.com",
      metadata: { [yearField._id]: String(YEAR - 2) },
      staffYear: YEAR,
    });
    const updated = await leader.query(api.attendanceMembers.get, {
      memberId,
      staffYear: YEAR,
    });
    if (!updated) throw new Error("Expected merged attendance member");
    expect(updated.isStaffOverlay).toBe(true);
    expect(updated.email).toBe(OUTSIDER);
    expect(updated.personalEmail).toBe("edited@example.com");
    expect(updated.name).toBe("Future Leader");
    expect(updated.metadata?.[yearField._id]).toBe(String(YEAR - 2));

    const pastYear = await leader.query(api.attendanceMembers.list, {
      year: YEAR - 5,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(pastYear.page.find((r) => r.key === `member:${memberId}`)?.email).toBe(
      "edited@example.com"
    );
    expect(pastYear.page.some((r) => r.key === `staff:${OUTSIDER}`)).toBe(false);
  });

  test("list shows a member whose email has no profile this year as a plain member", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const ghostId = await t.run(async (ctx) =>
      ctx.db.insert("attendanceMembers", {
        name: "Ghost",
        email: "ghost@sow.org.au",
      })
    );
    const page = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const row = page.page.find((r) => r.memberId === ghostId);
    expect(row?.kind).toBe("member");
    expect(row?.name).toBe("Ghost");
  });

  test("ensureForStaff reuses the member linked from last year's profile instead of duplicating", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const { memberId, profileId } = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Returning Staff" });
      await ctx.db.insert("staffProfiles", {
        email: "returning@sowaustralia.com",
        year: YEAR - 1,
        assignments: [{ role: "Staff", department: "Missions" }],
        memberId,
      });
      const profileId = await ctx.db.insert("staffProfiles", {
        email: "returning@sow.org.au",
        year: YEAR,
        assignments: [{ role: "Staff", department: "Missions" }],
      });
      return { memberId, profileId };
    });
    const before = await t.run((ctx) => ctx.db.query("attendanceMembers").collect());
    const ensured = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: "returning@sow.org.au",
    });
    expect(ensured).toBe(memberId);
    expect(await t.run((ctx) => ctx.db.query("attendanceMembers").collect())).toHaveLength(
      before.length
    );
    expect((await t.run((ctx) => ctx.db.get(profileId)))?.memberId).toBe(memberId);
  });

  test("ensureForStaff reuses a member linked from a profile with the same import id", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const memberId = await t.run(async (ctx) => {
      const memberId = await ctx.db.insert("attendanceMembers", { name: "Renamed Staff" });
      await ctx.db.insert("staffProfiles", {
        email: "maiden.name@sow.org.au",
        year: YEAR - 1,
        importId: "import-7",
        assignments: [{ role: "Staff", department: "Missions" }],
        memberId,
      });
      await ctx.db.insert("staffProfiles", {
        email: "married.name@sow.org.au",
        year: YEAR,
        importId: "import-7",
        assignments: [{ role: "Staff", department: "Missions" }],
      });
      return memberId;
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "married.name@sow.org.au",
      })
    ).toBe(memberId);
  });

  test("update of a staffer from a year they weren't staff is a plain member edit", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const memberId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "New Name",
      staffYear: YEAR - 5,
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.name).toBe("New Name");
  });

  test("next year's staff still holding their staff email can have it cleared this year", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    const NEXT = "next.leader@sow.org.au";
    const memberId = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: NEXT,
        year: YEAR + 1,
        name: "Next Leader",
        assignments: [{ role: "Student Leader", university: USYD }],
      });
      return await ctx.db.insert("attendanceMembers", { name: "Next Leader", email: NEXT });
    });
    const shown = await leader.query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(shown?.isStaffOverlay).toBe(false);
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId,
        name: "Next Leader",
        email: NEXT,
        staffYear: YEAR,
      })
    ).rejects.toThrow(/staff email/);
    await leader.mutation(api.attendanceMembers.update, {
      memberId,
      name: "Next Leader",
      staffYear: YEAR,
    });
    expect((await t.run((ctx) => ctx.db.get(memberId)))?.email).toBeUndefined();
  });

  test("ensureForStaff won't adopt an unlinked member without a staff profile", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    // An imported row with an SOW address (the app won't take one).
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", { name: "Outside Person", email: OUTSIDER })
    );
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    const row = await t.run((ctx) => ctx.db.get(memberId));
    expect(row?.email).toBe(OUTSIDER);
  });

  test("roster subtitle omits campus (shown by the chip) but keeps other metadata", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, {});
    const fields = await leader.query(api.attendanceMetadata.list, {});
    const campusField = fields.find((f) => f.key === "Campus")!;
    const genderField = fields.find((f) => f.key === "Gender")!;
    const usydId = Object.entries(campusField.values ?? {}).find(
      ([, label]) => label === USYD
    )?.[0]!;
    const maleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Male"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.create, {
      name: "Campus Guest",
      metadata: { [campusField._id]: usydId, [genderField._id]: maleId },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    const row = roster.find((r) => r.name === "Campus Guest")!;
    expect(row.university).toBe(USYD);
    expect(row.subtitle ?? "").not.toContain(USYD);
    expect(row.subtitle).toContain("Male");
  });

  test("search, filter, sort, and paginate", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "president@sow.org.au",
      year: YEAR,
      roles: ["President"],
      university: USYD,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "outsource@sow.org.au",
      year: YEAR,
      roles: ["Outsource"],
      department: "Missions",
    });
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    const year3Id = Object.entries(yearField.values ?? {}).find(
      ([, label]) => label === "3"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Zara Alpha",
      metadata: { [yearField._id]: String(YEAR - 2) },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Beta Guest",
      metadata: { [yearField._id]: String(YEAR - 1) },
    });

    const searched = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      search: "zara",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(searched.page.every((r) => r.name.toLowerCase().includes("zara"))).toBe(
      true
    );

    const genderField = fields.find((f) => f.key === "Gender")!;
    const genderMaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Male"
    )?.[0]!;
    const genderFemaleId = Object.entries(genderField.values ?? {}).find(
      ([, label]) => label === "Female"
    )?.[0]!;

    await leader.mutation(api.attendanceMembers.create, {
      name: "Meta Guest",
      metadata: { [genderField._id]: genderMaleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Multi Filter Guest",
      metadata: { [genderField._id]: genderFemaleId },
    });
    const roster = await leader.query(api.attendance.roster, { year: YEAR });
    expect(roster.some((r) => r.name === "Meta Guest" && r.subtitle?.includes("Male"))).toBe(
      true
    );

    const filtered = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: year3Id },
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(filtered.page.some((r) => r.name === "Zara Alpha")).toBe(true);
    expect(filtered.page.some((r) => r.name === "Beta Guest")).toBe(false);

    const byGender = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: genderMaleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byGender.page.some((r) => r.name === "Meta Guest")).toBe(true);

    const byMultipleGenders = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [genderField._id]: [genderMaleId, genderFemaleId] },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMultipleGenders.page.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Meta Guest", "Multi Filter Guest"])
    );

    const byMetaSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: genderField._id,
      sortAsc: true,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMetaSort.page.length).toBeGreaterThan(0);

    const campusField = fields.find((f) => f.key === "Campus")!;
    const roleField = fields.find((f) => f.key === "Role")!;
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          id: campusField._id,
          key: "Campus",
          type: "select",
          order: campusField.order,
          values: { ...campusField.values, "99": "Other" },
          lockedValues: campusField.lockedValues,
        },
        {
          id: roleField._id,
          key: "Role",
          type: "select",
          order: roleField.order,
          values: {
            ...roleField.values,
            "97": "Alumni",
            "98": "Newcomer",
          },
          lockedValues: roleField.lockedValues,
        },
      ],
      deleteIds: [],
    });
    const otherId = "99";
    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    const refreshedFields = await leader.query(api.attendanceMetadata.list, { });
    const refreshedCampus = refreshedFields.find((f) => f.key === "Campus")!;
    const refreshedRole = refreshedFields.find((f) => f.key === "Role")!;
    const usydId = Object.entries(refreshedCampus.values ?? {}).find(
      ([, label]) => label === USYD
    )?.[0]!;
    const leaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [refreshedCampus._id]: otherId, [roleField._id]: "Member" },
    });
    const listed = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 50, cursor: null },
    });
    const staffRow = listed.page.find((r) => r.email === LEADER);
    expect(staffRow?.university).toBe(USYD);
    expect(staffRow?.metadata[refreshedCampus._id]).toBe(usydId);
    expect(staffRow?.metadata[refreshedRole._id]).toBe(leaderRoleId);

    const staffRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Staff"
    )?.[0]!;
    const studentLeaderRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Student Leader"
    )?.[0]!;
    const memberRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Member"
    )?.[0]!;
    const newcomerRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Newcomer"
    )?.[0]!;
    const alumniRoleId = Object.entries(refreshedRole.values ?? {}).find(
      ([, label]) => label === "Alumni"
    )?.[0]!;
    await leader.mutation(api.attendanceMembers.create, {
      name: "Member Role Guest",
      metadata: { [refreshedRole._id]: memberRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Newcomer Role Guest",
      metadata: { [refreshedRole._id]: newcomerRoleId },
    });
    await leader.mutation(api.attendanceMembers.create, {
      name: "Alumni Role Guest",
      metadata: { [refreshedRole._id]: alumniRoleId },
    });
    const byStaffRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: staffRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStaffRole.page.some((r) => r.email === STAFF)).toBe(true);
    expect(byStaffRole.page.some((r) => r.email === "outsource@sow.org.au")).toBe(
      true
    );
    expect(byStaffRole.page.some((r) => r.email === LEADER)).toBe(false);
    expect(byStaffRole.page.some((r) => r.email === "president@sow.org.au")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Member Role Guest")).toBe(false);
    expect(byStaffRole.page.some((r) => r.name === "Newcomer Role Guest")).toBe(
      false
    );
    expect(byStaffRole.page.some((r) => r.name === "Alumni Role Guest")).toBe(false);

    const byStudentLeaderRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: studentLeaderRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byStudentLeaderRole.page.some((r) => r.email === LEADER)).toBe(true);
    expect(
      byStudentLeaderRole.page.some((r) => r.email === "president@sow.org.au")
    ).toBe(true);
    expect(byStudentLeaderRole.page.some((r) => r.email === STAFF)).toBe(false);

    // Newcomer comes from Insights, never a Role saved by hand: that one
    // isn't kept, so they're a Member until a build says otherwise.
    const byNewcomerRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: newcomerRoleId },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byNewcomerRole.page.map((r) => r.name)).not.toContain("Newcomer Role Guest");
    expect(byNewcomerRole.page.some((r) => r.email === STAFF)).toBe(false);
    const byMemberRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: "Member" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byMemberRole.page.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Member Role Guest", "Newcomer Role Guest"])
    );
    expect(byMemberRole.page.some((r) => r.kind === "staff")).toBe(false);
    const byAlumniRole = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [refreshedRole._id]: "Alumni" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byAlumniRole.page.map((r) => r.name)).toEqual(["Alumni Role Guest"]);
    expect(byAlumniRole.page[0].subtitle).toBe("Alumni");

    const unset = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: "unset" },
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(unset.page.every((r) => !r.metadata[yearField._id])).toBe(true);

    const byYearSort = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: yearField._id,
      sortAsc: false,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(byYearSort.page.length).toBeGreaterThan(0);

    const sorted = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: "name",
      sortAsc: true,
      paginationOpts: { numItems: 20, cursor: null },
    });
    const guestNames = sorted.page
      .filter((r) => r.kind === "member")
      .map((r) => r.name);
    expect(guestNames.indexOf("Beta Guest")).toBeLessThan(
      guestNames.indexOf("Zara Alpha")
    );

    const page1 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(page1.isDone).toBe(false);
    const page2 = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 2, cursor: page1.continueCursor },
    });
    expect(page2.page.length).toBeGreaterThan(0);
  });

  test("ensureForStaff, update, get, and remove", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;

    const shadowId = await leader.mutation(api.attendanceMembers.ensureForStaff, {
      staffEmail: LEADER,
    });
    expect(
      await leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: LEADER,
      })
    ).toBe(shadowId);

    await leader.mutation(api.attendanceMembers.update, {
      memberId: shadowId,
      name: "ignored",
      metadata: { [yearField._id]: String(YEAR) },
    });
    const shadow = await leader.query(api.attendanceMembers.get, {
      memberId: shadowId,
    });
    expect(shadow?.metadata?.[yearField._id]).toBe(String(YEAR));

    const guestId = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest",
    });
    await leader.mutation(api.attendanceMembers.update, {
      memberId: guestId,
      name: "Guest Renamed",
      email: "guest@test.org",
    });
    expect(await t.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();

    const { dateStart, dateEnd } = window();
    const eventId = await leader.mutation(api.events.create, {
      name: "E",
      dateStart,
      dateEnd,
      subgroups: [USYD],
    });
    await leader.mutation(api.attendance.signIn, { eventId, memberId: guestId });
    await asUser(t, ADMIN).mutation(api.attendanceMembers.remove, { memberId: guestId });
    expect(await leader.query(api.attendanceMembers.get, { memberId: guestId })).toBeNull();
    expect(await leader.query(api.attendance.listByEvent, { eventId })).toEqual([]);

    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: "   ",
      })
    ).rejects.toThrow(/email is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.ensureForStaff, {
        staffEmail: OUTSIDER,
      })
    ).rejects.toThrow(/not found/i);
    await expect(
      leader.mutation(api.attendanceMembers.create, { name: "  " })
    ).rejects.toThrow(/Name is required/i);
    const guest2 = await leader.mutation(api.attendanceMembers.create, {
      name: "Guest Two",
    });
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guest2,
        name: " ",
      })
    ).rejects.toThrow(/Name is required/i);
    await expect(
      leader.mutation(api.attendanceMembers.update, {
        memberId: guestId,
        name: "Ghost",
      })
    ).rejects.toThrow(/Member not found/i);
  });
});

describe("metadata saveAll edge cases", () => {
  test("deleting a locked field throws ConvexError", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const yearField = fields.find((f) => f.key === "Year")!;
    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [],
        deleteIds: [yearField._id],
      })
    ).rejects.toThrow(/Cannot delete locked/i);
  });

  test("deleting a custom field strips its value from members that have it", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [{ key: "Track", type: "input", order: 99 }],
      deleteIds: [],
    });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const trackField = fields.find((f) => f.key === "Track")!;
    const memberId = await leader.mutation(api.attendanceMembers.create, {
      name: "Trackee",
      metadata: { [trackField._id]: "Morning" },
    });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [],
      deleteIds: [trackField._id],
    });
    const member = await leader.query(api.attendanceMembers.get, { memberId });
    expect(member?.metadata?.[trackField._id]).toBeUndefined();
  });

  test("saving a field with a locked value removed throws ConvexError", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: [
        {
          key: "Track",
          type: "select",
          order: 99,
          values: { "1": "Morning", "2": "Evening" },
          lockedValues: ["Morning"],
        },
      ],
      deleteIds: [],
    });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const trackField = fields.find((f) => f.key === "Track")!;
    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [
          {
            id: trackField._id,
            key: "Track",
            type: "select",
            order: 99,
            values: { "2": "Evening" },
            lockedValues: ["Morning"],
          },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Cannot remove locked value/i);
  });
});

describe("attendanceMembers.byName", () => {
  test("matches case-insensitively, trims, and is staff-only", async () => {
    const t = await setup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceMetadata.ensureDefaults, { });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const campus = fields.find((f) => f.key === "Campus")!;
    const usydId = Object.entries(campus.values ?? {}).find(
      ([, label]) => label === USYD
    )![0];

    await leader.mutation(api.attendanceMembers.create, {
      name: "Jane Doe",
      email: "jane@example.com",
      metadata: { [campus._id]: usydId },
    });
    await leader.mutation(api.attendanceMembers.create, { name: "Jane Doe" });
    await leader.mutation(api.attendanceMembers.create, { name: "Someone Else" });

    expect(await t.query(api.attendanceMembers.byName, { name: "Jane Doe" })).toEqual(
      []
    );
    expect(await leader.query(api.attendanceMembers.byName, { name: "  " })).toEqual(
      []
    );

    const matches = await leader.query(api.attendanceMembers.byName, {
      name: "  jane DOE ",
    });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.name).sort()).toEqual(["Jane Doe", "Jane Doe"]);
    const withCampus = matches.find((m) => m.email === "jane@example.com")!;
    expect(withCampus.metadata[campus._id]).toBe(usydId);

    expect(
      await leader.query(api.attendanceMembers.byName, { name: "nobody" })
    ).toEqual([]);
  });
});
