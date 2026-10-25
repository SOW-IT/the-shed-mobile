/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { leadingRole, roleRank } from "./churches";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const STAFF = "sam.staff@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const signedIn = (t: TestConvex<typeof schema>, userId: string, email: string) =>
  t.withIdentity({ email, subject: `${userId}|session`, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  await t.run((ctx) =>
    ctx.db.insert("staffProfiles", { email: STAFF, year: YEAR, assignments: [{ role: "Staff" }] })
  );
  const samId = await t.run((ctx) => ctx.db.insert("users", { email: STAFF, name: "Sam Staff" }));
  return { t, sam: signedIn(t, samId, STAFF), samId };
}

describe("the church list", () => {
  test("staff add churches; the same name can't go in twice", async () => {
    const { t, sam } = await setup();
    expect(await t.query(api.churches.list, {})).toEqual([]);
    await expect(t.mutation(api.churches.add, { name: "Grace" })).rejects.toThrow();

    const grace = await sam.mutation(api.churches.add, {
      name: "  Grace   Church ",
      address: " 1 Church St,  Ryde ",
      services: [
        { day: 0, time: "17:00" },
        { day: 0, time: "10:00" },
      ],
      website: "gracechurch.org.au",
      instagram: "@gracechurchryde",
    });
    await sam.mutation(api.churches.add, { name: "Abba Church", services: [], website: " ", instagram: "" });
    const empty = { address: null, serviceTimes: null, services: [], website: null, instagram: null, location: null };
    expect(await sam.query(api.churches.list, {})).toEqual([
      { _id: expect.any(String), name: "Abba Church", ...empty },
      {
        _id: grace,
        name: "Grace Church",
        address: "1 Church St, Ryde",
        serviceTimes: "Sunday 10am and 5pm",
        services: [
          { day: 0, time: "10:00" },
          { day: 0, time: "17:00" },
        ],
        website: "https://gracechurch.org.au/",
        instagram: "gracechurchryde",
        location: null,
      },
    ]);
    await expect(sam.mutation(api.churches.add, { name: "grace church" })).rejects.toThrow(
      "Grace Church is already in the list"
    );
    await expect(sam.mutation(api.churches.add, { name: "   " })).rejects.toThrow("Add the church's name");
  });

  test("anyone on staff can fill in or fix a church's details", async () => {
    const { t, sam } = await setup();
    const abba = await sam.mutation(api.churches.add, { name: "Abba Church" });
    await sam.mutation(api.churches.add, { name: "Grace Church" });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.churches.update, {
      churchId: abba,
      name: "Abba Church",
      address: "2 Hill Rd, Eastwood",
      services: [{ day: 6, time: "18:30" }],
    });
    const row = await t.run((ctx) => ctx.db.get("churches", abba));
    expect(row).toMatchObject({ address: "2 Hill Rd, Eastwood", services: [{ day: 6, time: "18:30" }], updatedBy: ADMIN });
    const bad = (details: object) => admin.mutation(api.churches.update, { churchId: abba, name: "Abba Church", ...details });
    await expect(bad({ services: [{ day: 7, time: "10:00" }] })).rejects.toThrow("Pick a day and a time");
    await expect(bad({ services: [{ day: 0, time: "10am" }] })).rejects.toThrow("Pick a day and a time");
    await expect(
      bad({ services: Array.from({ length: 11 }, (_, i) => ({ day: 0, time: `${String(i + 8).padStart(2, "0")}:00` })) })
    ).rejects.toThrow("up to 10 service times");
    await expect(bad({ website: "not a site" })).rejects.toThrow("That website doesn't look right");
    await expect(bad({ instagram: "@not a handle" })).rejects.toThrow("That Instagram doesn't look right");
    await t.run((ctx) => ctx.db.patch("churches", abba, { services: undefined }));
    expect((await sam.query(api.churches.list, {})).find((c) => c._id === abba)).toMatchObject({
      serviceTimes: null,
      services: [],
    });
    await expect(
      admin.mutation(api.churches.update, { churchId: abba, name: "GRACE church" })
    ).rejects.toThrow("already in the list");
    await t.run((ctx) => ctx.db.delete("churches", abba));
    await expect(admin.mutation(api.churches.update, { churchId: abba, name: "Abba" })).rejects.toThrow(
      "isn't in the list any more"
    );
  });
});

describe("who can add and edit churches", () => {
  test("anyone with a staff profile, campus leaders too; others can only see and pick", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "pia@sow.org.au",
        year: YEAR,
        assignments: [{ role: "President", university: "University of Sydney" }],
      });
      return {
        pia: await ctx.db.insert("users", { email: "pia@sow.org.au", name: "Pia President" }),
        gus: await ctx.db.insert("users", { email: "gus@sow.org.au", name: "Gus Guest" }),
      };
    });
    const pia = signedIn(t, ids.pia, "pia@sow.org.au");
    const gus = signedIn(t, ids.gus, "gus@sow.org.au");

    await pia.mutation(api.churches.update, { churchId: grace, name: "Grace Church", address: "1 Church St" });
    expect(await pia.mutation(api.churches.add, { name: "Abba Church" })).toEqual(expect.any(String));

    expect((await gus.query(api.churches.list, {})).map((c) => c.name)).toEqual(["Abba Church", "Grace Church"]);
    await expect(gus.mutation(api.churches.add, { name: "Gus Church" })).rejects.toThrow("No role/department assigned");
    await expect(
      gus.mutation(api.churches.update, { churchId: grace, name: "Renamed", address: "" })
    ).rejects.toThrow("No role/department assigned");
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    const forGus = await gus.query(api.churches.directory, {});
    expect(forGus.map((d) => [d.church.name, d.people.map((p) => p.name), d.peopleCount])).toEqual([
      ["Abba Church", [], 0],
      ["Grace Church", ["Sam Staff"], 1],
    ]);
    await gus.mutation(api.profile.setChurch, { churchId: grace });
    expect((await gus.query(api.profile.get, {}))!.church?.name).toBe("Grace Church");

    expect(await t.query(api.churches.list, {})).toEqual([]);
    const forVisitors = await t.query(api.churches.directory, {});
    expect(forVisitors.map((d) => [d.church.name, d.church.address, d.people.map((p) => [p.name, p.email]), d.peopleCount])).toEqual([
      ["Abba Church", null, [], 0],
      ["Grace Church", "1 Church St", [["Sam Staff", STAFF]], 1],
    ]);
    expect(await t.run((ctx) => ctx.db.get("churches", grace))).toMatchObject({ name: "Grace Church", address: "1 Church St" });
  });
});

describe("an account with no staff profile sees what a visitor sees", () => {
  test("no other people's emails or member ids in the directory", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    const outsiderId = await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "gus@gmail.com", name: "Gus Guest", churchId: grace });
      await ctx.db.insert("attendanceMembers", { name: "Mia Member", churchId: grace });
      return await ctx.db.insert("users", { email: "relay@privaterelay.appleid.com", name: "Apple Person" });
    });
    const outsider = signedIn(t, outsiderId, "relay@privaterelay.appleid.com");
    const people = async (who: { query: typeof t.query }) =>
      (await who.query(api.churches.directory, {}))
        .find((d) => d.church.name === "Grace Church")!
        .people.map((p) => [p.name, p.email, p.memberId !== null])
        .sort();

    expect(await people(outsider)).toEqual(await people(t));
    expect(await people(outsider)).toEqual([["Sam Staff", STAFF, false]]);
    expect(await people(sam)).toEqual([
      ["Gus Guest", "gus@gmail.com", false],
      ["Mia Member", null, true],
      ["Sam Staff", STAFF, false],
    ]);
  });

  test("no last online or signed-in state on profiles, except their own", async () => {
    const { t, sam } = await setup();
    const ids = await t.run(async (ctx) => ({
      tom: await ctx.db.insert("users", { email: "tom@gmail.com", name: "Tom Guest" }),
      outsider: await ctx.db.insert("users", { email: "relay@privaterelay.appleid.com", name: "Apple Person" }),
    }));
    const outsider = signedIn(t, ids.outsider, "relay@privaterelay.appleid.com");
    const privateFields = (profile: Record<string, unknown> | null) => ({
      lastOnlineAt: profile?.lastOnlineAt === null ? null : "set",
      hasSignedIn: profile?.hasSignedIn,
    });
    const hidden = { lastOnlineAt: null, hasSignedIn: null };

    expect(privateFields(await outsider.query(api.profile.get, { email: "tom@gmail.com" }))).toEqual(hidden);
    expect(privateFields(await t.query(api.profile.get, { email: "tom@gmail.com" }))).toEqual(hidden);
    expect(privateFields(await sam.query(api.profile.get, { email: "tom@gmail.com" }))).toEqual({
      lastOnlineAt: null,
      hasSignedIn: true,
    });
    expect(
      privateFields(await signedIn(t, ids.tom, "tom@gmail.com").query(api.profile.get, {}))
    ).toEqual({ lastOnlineAt: null, hasSignedIn: true });
    expect((await outsider.query(api.profile.get, { email: STAFF }))?.name).toBe("Sam Staff");
  });
});

describe("the Churches page", () => {
  test("each church with who goes there and their role, leaders first, alumni last", async () => {
    const { t, sam } = await setup();
    expect(await t.query(api.churches.directory, {})).toEqual([]);
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const abba = await sam.mutation(api.churches.add, { name: "Abba Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    const campus = await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", {
        key: "Campus",
        type: "select",
        order: 0,
        values: { u: "University of New South Wales", o: "Other" },
      })
    );
    const role = await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", { key: "Role", type: "select", order: 1, values: { a: "Alumni", m: "Member" } })
    );
    await t.run(async (ctx) => {
      const staff = (
        email: string,
        assignments: { role: string; university?: string }[],
        name?: string,
        memberId?: Id<"attendanceMembers">,
        year = YEAR
      ) => ctx.db.insert("staffProfiles", { email, year, assignments, name, memberId });
      await staff("pia@sow.org.au", [{ role: "President", university: "University of Sydney" }]);
      await ctx.db.insert("users", { email: "pia@sow.org.au", name: "Pia President", churchId: grace });
      await staff("hal@sow.org.au", [{ role: "Staff" }, { role: "Head of Department" }]);
      await ctx.db.insert("users", { email: "hal@sow.org.au", name: "Hal Head", churchId: grace });
      await ctx.db.insert("users", { email: "fay@sow.org.au", name: "Fay Former", churchId: grace });
      const fay = await ctx.db.insert("attendanceMembers", { name: "Fay F", metadata: { [role]: "a" } });
      const gone = await ctx.db.insert("attendanceMembers", { name: "Gone" });
      await ctx.db.delete(gone);
      await staff("fay@sowaustralia.com", [{ role: "Staff" }], undefined, gone, YEAR - 1);
      await staff("fay@sow.org.au", [{ role: "Staff" }], undefined, fay, YEAR - 2);
      await ctx.db.insert("users", { email: "gus@sow.org.au", name: "Gus Gone", churchId: grace });
      await staff("gus@sow.org.au", [{ role: "Staff" }], undefined, undefined, YEAR - 1);
      await ctx.db.insert("users", { churchId: grace });
      const solMember = await ctx.db.insert("attendanceMembers", { name: "Sol Before Staff", churchId: grace });
      await staff("sol@sow.org.au", [{ role: "Staff" }], undefined, solMember);
      await ctx.db.insert("users", { email: "sol@sow.org.au", name: "Sol Staff", churchId: abba });
      const eve = await ctx.db.insert("attendanceMembers", { name: "Eve E", churchId: grace });
      await staff("eve@sow.org.au", [{ role: "Executive", university: "University of New South Wales" }], "Eve Exec", eve);
      const olly = await ctx.db.insert("attendanceMembers", { name: "Olly Old", churchId: grace, metadata: { [role]: "a" } });
      await staff("olly@sow.org.au", [{ role: "Executive", university: "University of Sydney" }], "Olly Exec", olly, YEAR - 1);
      await staff("olly@sow.org.au", [], "Olly Paused", olly);
    });
    await sam.mutation(api.attendanceMembers.create, { name: "Zed Member", churchId: grace, metadata: { [campus]: "u" } });
    await sam.mutation(api.attendanceMembers.create, { name: "Amy Member", churchId: grace, metadata: { [campus]: "o", [role]: "m" } });
    await sam.mutation(api.attendanceMembers.create, { name: "Ali Alumni", churchId: grace, metadata: { [role]: "a" } });

    const directory = await sam.query(api.churches.directory, {});
    expect(directory.map((d) => d.church.name)).toEqual(["Abba Church", "Grace Church"]);
    expect(directory[0].people.map((p) => [p.name, p.role])).toEqual([["Sol Staff", "Staff"]]);
    const grace_ = directory[1].people;
    expect(grace_.map((p) => [p.name, p.role, p.group, p.campus])).toEqual([
      ["Hal Head", "Head of Department", "staff", null],
      ["Sam Staff", "Staff", "staff", null],
      ["Pia President", "President", "leader", "University of Sydney"],
      ["Eve Exec", "Executive", "leader", "University of New South Wales"],
      ["Amy Member", "Member", "member", null],
      ["Gus Gone", "Member", "member", null],
      ["Zed Member", "Member", "member", "University of New South Wales"],
      ["Ali Alumni", "Alumni", "member", null],
      ["Fay Former", "Alumni", "member", null],
      ["Olly Old", "Alumni", "member", null],
    ]);
    expect(grace_[0]).toEqual({
      name: "Hal Head",
      role: "Head of Department",
      group: "staff",
      campus: null,
      email: "hal@sow.org.au",
      memberId: null,
    });
    expect(grace_[3]).toMatchObject({ email: "eve@sow.org.au", memberId: expect.any(String) });
    expect(grace_[6]).toMatchObject({ email: null, memberId: expect.any(String) });
    expect(grace_[8]).toMatchObject({ email: "fay@sow.org.au", memberId: null });
    expect(grace_[9]).toMatchObject({ email: null, memberId: expect.any(String) });

    const forVisitors = (await t.query(api.churches.directory, {}))[1].people;
    expect(forVisitors.map((p) => [p.name, p.role, p.email, p.memberId])).toEqual([
      ["Hal Head", "Head of Department", "hal@sow.org.au", null],
      ["Sam Staff", "Staff", STAFF, null],
      ["Pia President", "President", "pia@sow.org.au", null],
      ["Eve Exec", "Executive", "eve@sow.org.au", null],
    ]);
  });

  test("a signed-up user whose current profile has no assignments is listed as their member row, not as staff", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const role = await t.run((ctx) =>
      ctx.db.insert("attendanceMetadata", { key: "Role", type: "select", order: 1, values: { a: "Alumni", m: "Member" } })
    );
    await t.run(async (ctx) => {
      const olly = await ctx.db.insert("attendanceMembers", { name: "Olly Old", metadata: { [role]: "a" } });
      await ctx.db.insert("staffProfiles", {
        email: "olly@sow.org.au",
        year: YEAR - 1,
        memberId: olly,
        assignments: [{ role: "Executive", university: "University of Sydney" }],
      });
      await ctx.db.insert("staffProfiles", { email: "olly@sow.org.au", year: YEAR, memberId: olly, assignments: [] });
      await ctx.db.insert("users", { email: "olly@sow.org.au", name: "Olly User", churchId: grace });
    });
    const forStaff = (await sam.query(api.churches.directory, {}))[0].people;
    expect(forStaff.find((p) => p.name === "Olly User")).toMatchObject({ role: "Alumni", group: "member" });
    expect((await t.query(api.churches.directory, {}))[0].people).toEqual([]);
  });

  test("members' churches are only for staff and campus leaders", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email: "pia@sow.org.au",
        year: YEAR,
        assignments: [{ role: "President", university: "University of Sydney" }],
      });
      await ctx.db.insert("attendanceMembers", { name: "Mia Member", churchId: grace });
      return {
        pia: await ctx.db.insert("users", { email: "pia@sow.org.au", name: "Pia President", churchId: grace }),
        max: await ctx.db.insert("users", { email: "max@sow.org.au", name: "Max Member", churchId: grace }),
      };
    });
    const pia = signedIn(t, ids.pia, "pia@sow.org.au");
    const max = signedIn(t, ids.max, "max@sow.org.au");
    const names = async (who: { query: typeof t.query }) =>
      (await who.query(api.churches.directory, {}))[0].people.map((p) => p.name).sort();

    const everyone = ["Max Member", "Mia Member", "Pia President", "Sam Staff"];
    expect(await names(sam)).toEqual(everyone);
    expect(await names(pia)).toEqual(everyone);
    expect(await names(max)).toEqual(["Pia President", "Sam Staff"]);
    expect(await names(t)).toEqual(["Pia President", "Sam Staff"]);

    const churchOf = async (who: { query: typeof t.query }, email: string) =>
      (await who.query(api.profile.get, { email }))?.church?.name ?? null;
    expect(await churchOf(sam, "max@sow.org.au")).toBe("Grace Church");
    expect(await churchOf(max, "max@sow.org.au")).toBe("Grace Church");
    expect(await churchOf(t, "max@sow.org.au")).toBeNull();
    expect(await churchOf(t, "pia@sow.org.au")).toBe("Grace Church");
  });

  test("a person's leading role, and where a role sorts", () => {
    expect(leadingRole([])).toBe("Member");
    expect(leadingRole(["Member"])).toBe("Member");
    expect(leadingRole(["Staff", "Director", "Member"])).toBe("Director");
    expect(leadingRole(["Zeta Role", "Alpha Role"])).toBe("Alpha Role");
    expect(roleRank("Student Leader")).toBeLessThan(roleRank("Alpha Role"));
    expect(roleRank("Alpha Role")).toBeLessThan(roleRank("Member"));
    expect(roleRank("Member")).toBeLessThan(roleRank("Alumni"));
  });
});

describe("the map", () => {
  const KEY = "maps-test-key";
  const found = (lat: number, lng: number) => ({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ status: "OK", results: [{ geometry: { location: { lat, lng } } }] }),
  });
  const reply = (body: object, status = 200) => ({ ok: status === 200, status, json: () => Promise.resolve(body) });
  const located = async (t: TestConvex<typeof schema>, name: string) =>
    (await t.run((ctx) => ctx.db.query("churches").collect())).find((c) => c.name === name)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("GOOGLE_MAPS_API_KEY", KEY);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("a church with an address is put on the map", async () => {
    const fetchMock = vi.fn().mockResolvedValue(found(-33.83, 151.13));
    vi.stubGlobal("fetch", fetchMock);
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "1 Church St, Ryde" });
    await sam.mutation(api.churches.add, { name: "Abba Church" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      address: "1 Church St, Ryde",
      components: "country:AU",
      key: KEY,
    });
    const list = await sam.query(api.churches.list, {});
    expect(list.find((c) => c._id === grace)?.location).toEqual({ lat: -33.83, lng: 151.13 });
    expect(list.find((c) => c.name === "Abba Church")?.location).toBeNull();
    expect((await sam.query(api.churches.directory, {}))[1].church.location).toEqual({ lat: -33.83, lng: 151.13 });
  });

  test("the nightly run looks nothing up where nightly jobs are paused", async () => {
    const fetchMock = vi.fn().mockResolvedValue(found(-33.8, 151.0));
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup();
    vi.stubEnv("NIGHTLY_JOBS_PAUSED", "true");
    await t.run((ctx) => ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", address: "1 Main St", addedBy: "sam@sow.org.au" }));
    expect(await t.action(internal.churches.locateAll, { nightly: true })).toEqual({ located: 0, notFound: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 1, notFound: 0, failed: 0 });
  });

  test("a new address is looked up again; one Google can't find is tried again weeks later", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ status: "ZERO_RESULTS", results: [] }))
      .mockResolvedValue(found(-33.8, 151.0));
    vi.stubGlobal("fetch", fetchMock);
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "Nowhere Rd" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let church = await located(t, "Grace Church");
    expect(church.location).toBeUndefined();
    expect(church.locatedAt).toEqual(expect.any(Number));

    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 0, notFound: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 26 * 24 * 60 * 60 * 1000);
    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 1, notFound: 0, failed: 0 });
    expect((await located(t, "Grace Church")).location).toEqual({ lat: -33.8, lng: 151.0 });

    const save = (address?: string) =>
      sam.mutation(api.churches.update, { churchId: grace, name: "Grace Church", address, services: [] });
    await save("Nowhere Rd");
    expect((await located(t, "Grace Church")).location).toEqual({ lat: -33.8, lng: 151.0 });

    fetchMock.mockResolvedValue(found(-33.7, 151.1));
    await save("2 Hill Rd, Eastwood");
    church = await located(t, "Grace Church");
    expect(church.location).toBeUndefined();
    expect(church.locatedAt).toBeUndefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await located(t, "Grace Church")).location).toEqual({ lat: -33.7, lng: 151.1 });

    const calls = fetchMock.mock.calls.length;
    await save(undefined);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await located(t, "Grace Church")).location).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  test("Google refusing or failing is counted, and tried again next time", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ status: "REQUEST_DENIED", error_message: "Bad key" }))
      .mockResolvedValueOnce(reply({}, 500))
      .mockResolvedValueOnce(reply({ status: "OK", results: [] }))
      .mockResolvedValueOnce(reply({ status: "OVER_QUERY_LIMIT" }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, sam } = await setup();
    for (const name of ["A Church", "B Church", "C Church", "D Church"]) {
      await sam.mutation(api.churches.add, { name, address: `${name} St` });
    }
    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 0, notFound: 0, failed: 4 });
    expect(errors.mock.calls.map(([message]) => message)).toEqual([
      'Couldn\'t find "A Church St" on the map',
      'Couldn\'t find "B Church St" on the map',
      'Couldn\'t find "C Church St" on the map',
      'Couldn\'t find "D Church St" on the map',
    ]);
    expect(String(errors.mock.calls[0][1])).toContain("REQUEST_DENIED: Bad key");
    expect(String(errors.mock.calls[1][1])).toContain("HTTP 500");
    expect((await located(t, "A Church")).locatedAt).toBeUndefined();

    fetchMock.mockResolvedValue(found(-33.9, 151.2));
    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 4, notFound: 0, failed: 0 });
  });

  test("an answer for an address that has since changed is dropped", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "New St" });
    await t.mutation(internal.churches.saveLocation, {
      churchId: grace,
      address: "Old St",
      location: { lat: 1, lng: 2 },
    });
    expect((await located(t, "Grace Church")).location).toBeUndefined();
    await t.run((ctx) => ctx.db.delete("churches", grace));
    await t.mutation(internal.churches.saveLocation, { churchId: grace, address: "New St", location: null });
  });

  test("without a key nothing is looked up", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, sam } = await setup();
    await sam.mutation(api.churches.add, { name: "Grace Church", address: "1 Church St" });
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
    expect(await t.action(internal.churches.locateAll, {})).toEqual({ located: 0, notFound: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a member's church", () => {
  test("is set when adding or editing them, and can be cleared", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const memberId = await sam.mutation(api.attendanceMembers.create, { name: "Mia Member", churchId: grace });
    const get = () => t.run((ctx) => ctx.db.get("attendanceMembers", memberId));
    expect((await get())?.churchId).toBe(grace);
    const save = (churchId?: typeof grace | null) =>
      sam.mutation(api.attendanceMembers.update, { memberId, name: "Mia Member", staffYear: YEAR, ...(churchId === undefined ? {} : { churchId }) });
    await save();
    expect((await get())?.churchId).toBe(grace);
    await save(null);
    expect((await get())?.churchId).toBeUndefined();
    await t.run((ctx) => ctx.db.delete("churches", grace));
    await expect(save(grace)).rejects.toThrow("isn't in the list any more");
    await expect(sam.mutation(api.attendanceMembers.create, { name: "Late Member", churchId: grace })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("a staff person's comes from their Profile", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    const memberId = await asUser(t, ADMIN).mutation(api.attendanceMembers.ensureForStaff, { staffEmail: STAFF });
    const row = () => asUser(t, ADMIN).query(api.attendanceMembers.get, { memberId, staffYear: YEAR });
    expect(await row()).toMatchObject({ isStaffOverlay: true, profileChurch: null });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    expect(await row()).toMatchObject({ profileChurch: "Grace Church" });
    const plain = await sam.mutation(api.attendanceMembers.create, { name: "Plain Person" });
    expect(await asUser(t, ADMIN).query(api.attendanceMembers.get, { memberId: plain, staffYear: YEAR })).toMatchObject({
      isStaffOverlay: false,
      profileChurch: null,
    });
  });
});

describe("your church in your Profile", () => {
  test("pick one from the list, see it with its details, or clear it", async () => {
    const { t, sam } = await setup();
    let mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({ church: null });

    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "1 Church St" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({
      church: { _id: grace, name: "Grace Church", address: "1 Church St", serviceTimes: null },
    });
    expect((await asUser(t, ADMIN).query(api.profile.get, { email: STAFF }))!.church?.name).toBe("Grace Church");
    expect((await t.query(api.profile.get, { email: STAFF }))!.church?.name).toBe("Grace Church");

    await sam.mutation(api.profile.setChurch, { churchId: null });
    expect((await sam.query(api.profile.get, {}))!.church).toBeNull();

    await t.run((ctx) => ctx.db.delete("churches", grace));
    await expect(sam.mutation(api.profile.setChurch, { churchId: grace })).rejects.toThrow(
      "isn't in the list any more"
    );
  });
});

describe("the reminder", () => {
  test("goes to this year's staff without a church: a notification and a push", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: "new.one@sow.org.au", year: YEAR, assignments: [{ role: "Staff" }] });
      await ctx.db.insert("staffProfiles", { email: "gone@sow.org.au", year: YEAR - 1, assignments: [{ role: "Staff" }] });
    });

    const dry = await t.mutation(internal.churches.remindToSetChurch, {});
    expect(dry).toEqual({ staff: 3, withoutChurch: 2, reminded: 0 });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toEqual([]);

    const sent = await t.mutation(internal.churches.remindToSetChurch, { dryRun: false });
    expect(sent).toEqual({ staff: 3, withoutChurch: 2, reminded: 2 });
    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes.map((n) => n.userEmail).sort()).toEqual([ADMIN, "new.one@sow.org.au"]);
    expect(notes[0]).toMatchObject({ title: "Set your local church", url: "/profile", read: false });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((s) => s.name)).toContain("push:sendMany");
    expect(scheduled.find((s) => s.name === "push:sendMany")!.args[0]).toMatchObject({
      to: expect.arrayContaining([ADMIN, "new.one@sow.org.au"]),
      title: "Set your local church",
      url: "/profile",
    });
  });

  test("nobody to remind: nothing is sent", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    await t.run(async (ctx) => {
      const admin = (await ctx.db.query("staffProfiles").collect()).find((p) => p.email === ADMIN)!;
      await ctx.db.delete("staffProfiles", admin._id);
    });
    expect(await t.mutation(internal.churches.remindToSetChurch, { dryRun: false })).toEqual({
      staff: 1,
      withoutChurch: 0,
      reminded: 0,
    });
    expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  });
});

