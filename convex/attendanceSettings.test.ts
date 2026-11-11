import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  type T,
  YEAR,
  ADMIN,
  LEADER,
  STAFF,
  USYD,
  MACQ,
  asUser,
  pinClock,
  campusSetup,
} from "../test/convexFixture";

pinClock();

async function campusWithDefaults() {
  const t = await campusSetup();
  await asUser(t, LEADER).mutation(api.attendanceMetadata.ensureDefaults, {});
  return t;
}

describe("Campus locked options across the staff-year rollover", () => {
  test("a university from the previous staff year stays locked", async () => {
    const t = await campusSetup();
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
    const t = await campusWithDefaults();
    const admin = asUser(t, ADMIN);
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

describe("attendance tags", () => {
  test("list is staff-only and sorted by name", async () => {
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
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

  test("plain staff cannot manage shared attendance settings", async () => {
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
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

describe("attendance tags in two lists", () => {
  const listed = async (t: T) =>
    (await asUser(t, LEADER).query(api.attendanceTags.list, {})).map((tag) => `${tag.list ?? "-"}:${tag.name}`);

  test("new tags go in Other events unless they say Weeklies", async () => {
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    await leader.mutation(api.attendanceTags.saveAll, {
      tags: [{ name: "Social" }, { name: "BAM", list: "weeklies" }, { name: "Retreat", list: "events" }],
      deleteIds: [],
    });
    expect(await listed(t)).toEqual(["weeklies:BAM", "events:Retreat", "events:Social"]);
  });

  test("a name is unique within a list, but both lists can have it", async () => {
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
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
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const old = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Weekly Meeting" }));
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ id: old, name: "Weekly Catch-up" }], deleteIds: [] });
    expect(await t.run((ctx) => ctx.db.get(old))).toMatchObject({ name: "Weekly Catch-up" });
    await leader.mutation(api.attendanceTags.saveAll, { tags: [], deleteIds: [old] });
    expect(await t.run((ctx) => ctx.db.get(old))).toBeNull();
  });

  test("no other tag can take the Weeklies name, in either list", async () => {
    const t = await campusSetup();
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
    const t = await campusSetup();
    const leader = asUser(t, LEADER);
    const id = await t.run((ctx) => ctx.db.insert("attendanceTags", { name: "Gone", list: "events" }));
    await leader.mutation(api.attendanceTags.saveAll, { tags: [{ id, name: "Gone" }], deleteIds: [id] });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
  });
});

describe("attendance metadata", () => {
  test("ensureDefaults seeds Year/Gender/Campus/Role once", async () => {
    const t = await campusSetup();
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
    const t = await campusSetup();
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

  test("list is staff-only and strips Gender Other but keeps Female", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
    expect(await t.query(api.attendanceMetadata.list, { })).toEqual([]);
    const fields = await leader.query(api.attendanceMetadata.list, { });
    const gender = fields.find((f) => f.key === "Gender");
    expect(Object.values(gender?.values ?? {})).not.toContain("Other");
    expect(Object.values(gender?.values ?? {})).toContain("Female");
    expect(Object.values(gender?.values ?? {})).toContain("Male");
  });

  test("saveAll creates, patches, and guards locked values", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
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
    await expect(
      leader.mutation(api.attendanceMetadata.saveAll, {
        fields: [
          { key: "Notes", type: "input", order: 5 },
          { key: "other information", type: "input", order: 6 },
        ],
        deleteIds: [],
      })
    ).rejects.toThrow(/Duplicate metadata field "other information"/i);

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
    const t = await campusWithDefaults();
    const admin = asUser(t, ADMIN);
    const leader = asUser(t, LEADER);

    await admin.mutation(api.admin.upsertRole, { year: YEAR, name: "Volunteer" });
    await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: "Temp Uni" });
    const fields = await leader.query(api.attendanceMetadata.list, { });
    expect(fields.find((f) => f.key === "Role")!.lockedValues).toContain("Volunteer");
    expect(fields.find((f) => f.key === "Campus")!.lockedValues).toContain("Temp Uni");
    await leader.mutation(api.attendanceMetadata.saveAll, {
      fields: fields
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

describe("metadata saveAll edge cases", () => {
  test("deleting a locked field throws ConvexError", async () => {
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
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
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
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
    const t = await campusWithDefaults();
    const leader = asUser(t, LEADER);
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
