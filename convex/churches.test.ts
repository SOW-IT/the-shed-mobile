/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
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
      serviceTimes: "Sunday 10am",
    });
    await sam.mutation(api.churches.add, { name: "Abba Church", serviceTimes: "  " });
    expect(await sam.query(api.churches.list, {})).toEqual([
      { _id: expect.any(String), name: "Abba Church", address: null, serviceTimes: null, location: null },
      { _id: grace, name: "Grace Church", address: "1 Church St, Ryde", serviceTimes: "Sunday 10am", location: null },
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
      serviceTimes: "Sunday 11am",
    });
    const row = await t.run((ctx) => ctx.db.get("churches", abba));
    expect(row).toMatchObject({ address: "2 Hill Rd, Eastwood", serviceTimes: "Sunday 11am", updatedBy: ADMIN });
    await expect(
      admin.mutation(api.churches.update, { churchId: abba, name: "GRACE church" })
    ).rejects.toThrow("already in the list");
    await t.run((ctx) => ctx.db.delete("churches", abba));
    await expect(admin.mutation(api.churches.update, { churchId: abba, name: "Abba" })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("setUp adds the starter churches once and links what people typed", async () => {
    const { t, samId } = await setup();
    const [other, saesoon] = await t.run(async (ctx) => {
      await ctx.db.patch("users", samId, { localChurch: "harbour city  church" });
      return [
        await ctx.db.insert("users", { email: "x@gmail.com", localChurch: "Somewhere Else" }),
        // Typed another way: an alias of a starter church.
        await ctx.db.insert("users", { email: "y@gmail.com", localChurch: "New Life Sydney (Saesoon Presbyterian Church)" }),
      ];
    });
    expect(await t.mutation(internal.churches.setUp, {})).toEqual({ added: 4, linked: 2, next: null });
    expect(await t.mutation(internal.churches.setUp, {})).toEqual({ added: 0, linked: 0, next: null });
    const churches = await t.run((ctx) => ctx.db.query("churches").collect());
    const harbour = churches.find((c) => c.name === "Harbour City Church")!;
    expect(harbour).toMatchObject({ address: "41b College Street, Gladesville NSW 2111", serviceTimes: "Sunday 10:30am" });
    expect(churches.find((c) => c.name === "Living Hope Presbyterian Church")).toMatchObject({
      serviceTimes: "Sunday 10am and 12pm",
    });
    expect(churches.find((c) => c.name === "Sydney Young Nak Church")).toMatchObject({
      address: "7-9 Manson Street, Telopea NSW",
      serviceTimes: "Sunday 1:15pm",
    });
    const newLife = churches.find((c) => c.name === "Sydney Sae Soon Presbyterian Church (New Life)")!;
    expect(newLife).toMatchObject({ address: "219A North Rocks Road, North Rocks NSW", serviceTimes: "Sunday 10am" });
    expect(await t.run((ctx) => ctx.db.get("users", saesoon))).toMatchObject({ churchId: newLife._id });
    const [sam, x] = await t.run(async (ctx) => [await ctx.db.get("users", samId), await ctx.db.get("users", other)]);
    expect(sam).toMatchObject({ churchId: harbour._id });
    expect(sam?.localChurch).toBeUndefined();
    expect(x).toMatchObject({ localChurch: "Somewhere Else" });
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
    expect(await gus.query(api.churches.directory, {})).toEqual([]);
    await gus.mutation(api.profile.setChurch, { churchId: grace });
    expect((await gus.query(api.profile.get, {}))!.church?.name).toBe("Grace Church");

    expect(await t.query(api.churches.list, {})).toEqual([]);
    expect(await t.query(api.churches.directory, {})).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get("churches", grace))).toMatchObject({ name: "Grace Church", address: "1 Church St" });
  });
});

describe("setUp pages through users", () => {
  test("returns where to carry on until every user has been looked at", async () => {
    const { t } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 520; i++) {
        await ctx.db.insert("users", { email: `u${i}@gmail.com`, localChurch: i === 519 ? "Harbour City Church" : undefined });
      }
    });
    const first = await t.mutation(internal.churches.setUp, {});
    expect(first).toMatchObject({ linked: 0 });
    expect(first.next).not.toBeNull();
    expect(await t.mutation(internal.churches.setUp, { cursor: first.next })).toMatchObject({ linked: 1, next: null });
  });
});

describe("the Churches page", () => {
  test("each church with who goes there and their role, leaders first", async () => {
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
    await t.run(async (ctx) => {
      const staff = (email: string, assignments: { role: string; university?: string }[], name?: string) =>
        ctx.db.insert("staffProfiles", { email, year: YEAR, assignments, name });
      await staff("pia@sow.org.au", [{ role: "President", university: "University of Sydney" }]);
      await ctx.db.insert("users", { email: "pia@sow.org.au", name: "Pia President", churchId: grace });
      await staff("hal@sow.org.au", [{ role: "Staff" }, { role: "Head of Department" }]);
      await ctx.db.insert("users", { email: "hal@sow.org.au", name: "Hal Head", churchId: grace });
      await ctx.db.insert("users", { email: "fay@sow.org.au", name: "Fay Former", churchId: grace });
      await ctx.db.insert("users", { churchId: grace });
      await staff("sol@sow.org.au", [{ role: "Staff" }]);
      await ctx.db.insert("users", { email: "sol@sow.org.au", name: "Sol Staff", churchId: abba });
      await ctx.db.insert("attendanceMembers", { name: "Sol Before Staff", email: "sol@sow.org.au", churchId: grace });
      await staff("eve@sow.org.au", [{ role: "Executive", university: "University of New South Wales" }], "Eve Exec");
      await ctx.db.insert("attendanceMembers", { name: "Eve E", email: "eve@sow.org.au", churchId: grace });
    });
    await sam.mutation(api.attendanceMembers.create, { name: "Zed Member", churchId: grace, metadata: { [campus]: "u" } });
    await sam.mutation(api.attendanceMembers.create, { name: "Amy Member", churchId: grace, metadata: { [campus]: "o" } });

    const directory = await sam.query(api.churches.directory, {});
    expect(directory.map((d) => d.church.name)).toEqual(["Abba Church", "Grace Church"]);
    expect(directory[0].people.map((p) => [p.name, p.role])).toEqual([["Sol Staff", "Staff"]]);
    const grace_ = directory[1].people;
    expect(grace_.map((p) => [p.name, p.role, p.campus])).toEqual([
      ["Hal Head", "Head of Department", null],
      ["Sam Staff", "Staff", null],
      ["Pia President", "President", "University of Sydney"],
      ["Eve Exec", "Executive", "University of New South Wales"],
      ["Amy Member", "Member", null],
      ["Fay Former", "Member", null],
      ["Zed Member", "Member", "University of New South Wales"],
    ]);
    expect(grace_[0]).toEqual({
      name: "Hal Head",
      role: "Head of Department",
      campus: null,
      email: "hal@sow.org.au",
      memberId: null,
    });
    expect(grace_[3]).toMatchObject({ email: "eve@sow.org.au", memberId: expect.any(String) });
    expect(grace_[6]).toMatchObject({ email: null, memberId: expect.any(String) });
  });

  test("a person's leading role, and where a role sorts", () => {
    expect(leadingRole([])).toBe("Member");
    expect(leadingRole(["Member"])).toBe("Member");
    expect(leadingRole(["Staff", "Director", "Member"])).toBe("Director");
    expect(leadingRole(["Zeta Role", "Alpha Role"])).toBe("Alpha Role");
    expect(roleRank("Student Leader")).toBeLessThan(roleRank("Alpha Role"));
    expect(roleRank("Alpha Role")).toBeLessThan(roleRank("Member"));
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
      sam.mutation(api.churches.update, { churchId: grace, name: "Grace Church", address, serviceTimes: "Sunday" });
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

  test("setUp puts the starter churches on the map", async () => {
    const fetchMock = vi.fn().mockResolvedValue(found(-33.8, 151.1));
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await setup();
    await t.mutation(internal.churches.setUp, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await located(t, "Harbour City Church")).location).toEqual({ lat: -33.8, lng: 151.1 });
    expect((await located(t, "Living Hope Presbyterian Church")).location).toBeUndefined();

    await t.mutation(internal.churches.setUp, {});
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter((s) => s.state.kind === "pending")).toEqual([]);
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
    const { t, sam, samId } = await setup();
    await t.run((ctx) => ctx.db.patch("users", samId, { localChurch: "Old Typed Church" }));
    let mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({ church: null, typedChurch: "Old Typed Church", localChurch: "Old Typed Church" });

    const grace = await sam.mutation(api.churches.add, { name: "Grace Church", address: "1 Church St" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    mine = (await sam.query(api.profile.get, {}))!;
    expect(mine).toMatchObject({
      church: { _id: grace, name: "Grace Church", address: "1 Church St", serviceTimes: null },
      typedChurch: null,
      // Older app builds show the church's name.
      localChurch: "Grace Church",
    });
    // Others see it too; signed-out visitors don't.
    expect((await asUser(t, ADMIN).query(api.profile.get, { email: STAFF }))!.church?.name).toBe("Grace Church");
    expect((await t.query(api.profile.get, { email: STAFF }))!.church).toBeNull();

    await sam.mutation(api.profile.setChurch, { churchId: null });
    expect((await sam.query(api.profile.get, {}))!.church).toBeNull();

    await t.run((ctx) => ctx.db.delete("churches", grace));
    await expect(sam.mutation(api.profile.setChurch, { churchId: grace })).rejects.toThrow(
      "isn't in the list any more"
    );
  });

  test("an older app's typed church links to the list when the name matches", async () => {
    const { t, sam, samId } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.updateChurch, { localChurch: " grace church " });
    let row = await t.run((ctx) => ctx.db.get("users", samId));
    expect(row).toMatchObject({ churchId: grace });
    expect(row?.localChurch).toBeUndefined();

    await sam.mutation(api.profile.updateChurch, { localChurch: "Not Listed" });
    row = await t.run((ctx) => ctx.db.get("users", samId));
    expect(row?.churchId).toBeUndefined();
    expect(row?.localChurch).toBe("Not Listed");
  });
});

describe("the reminder", () => {
  test("goes to this year's staff without a church: a notification and a push", async () => {
    const { t, sam } = await setup();
    const grace = await sam.mutation(api.churches.add, { name: "Grace Church" });
    await sam.mutation(api.profile.setChurch, { churchId: grace });
    // Someone on staff who has never signed in, and someone who left staff.
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

