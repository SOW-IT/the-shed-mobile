/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const RACHEL = "rachel@sow.org.au";
const HENRY = "henry@sow.org.au";
const BELLA = "bella@sow.org.au";
const FIONA = "fiona@sow.org.au";
const DAN = "dan@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
    headEmail: HENRY,
  });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  for (const a of [
    { email: RACHEL, roles: ["Staff"], department: "Marketing" },
    { email: BELLA, roles: ["Staff"], department: "Finance" },
    { email: DAN, roles: ["Director"], department: "Marketing" },
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

describe("serverInfo", () => {
  test("returns the year, domain and structure for signed-in callers, null otherwise", async () => {
    const t = await setup();
    vi.stubEnv("AUTH_ALLOWED_DOMAIN", "sow.org.au");
    expect(await t.query(api.directory.serverInfo, {})).toBeNull(); // unauthenticated

    const info = (await asUser(t, RACHEL).query(api.directory.serverInfo, {}))!;
    expect(info.staffYear).toBe(YEAR);
    expect(info.nextStaffYear).toBe(YEAR + 1);
    expect(info.allowedDomain).toBe("sow.org.au");
    expect(info.divisions).toContain("Governance");
    expect(info.departments.find((d) => d.name === "Finance")?.division).toBe("Governance");
  });

  test("falls back to the default domain when the env var is unset", async () => {
    const t = await setup();
    vi.stubEnv("AUTH_ALLOWED_DOMAIN", undefined);
    const info = (await asUser(t, RACHEL).query(api.directory.serverInfo, {}))!;
    expect(info.allowedDomain).toBe("sow.org.au");
  });
});

describe("me", () => {
  test("null when unauthenticated", async () => {
    const t = await setup();
    expect(await t.query(api.directory.me, {})).toBeNull();
  });

  test("an unprovisioned but signed-in user gets a null profile and their photo", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("users", {
        email: "walter@sow.org.au",
        name: "Walter W",
        image: "https://example.com/walter.png",
      })
    );
    const me = (await asUser(t, "walter@sow.org.au").query(api.directory.me, {}))!;
    expect(me.profile).toBeNull();
    expect(me.name).toBe("Walter W");
    expect(me.photo).toBe("https://example.com/walter.png");
  });

  test("an uploaded avatar wins over the Google image", async () => {
    const t = await setup();
    const avatarId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["png"], { type: "image/png" }))
    );
    await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R", image: "g", avatarId })
    );
    const me = (await asUser(t, RACHEL).query(api.directory.me, {}))!;
    expect(me.photo).toBeTruthy();
    expect(me.photo).not.toBe("g");
  });

  test("reports capabilities for the Finance Head", async () => {
    const t = await setup();
    const me = (await asUser(t, FIONA).query(api.directory.me, {}))!;
    expect(me.profile?.department).toBe("Finance");
    expect(me.isFinance).toBe(true);
    expect(me.isFinanceHead).toBe(true);
    expect(me.isApprover).toBe(true);
  });

  test("reports capabilities for the Director and the Budget Manager", async () => {
    const t = await setup();
    const dan = (await asUser(t, DAN).query(api.directory.me, {}))!;
    expect(dan.isDirector).toBe(true);
    expect(dan.isApprover).toBe(true);

    const bella = (await asUser(t, BELLA).query(api.directory.me, {}))!;
    expect(bella.isBudgetManager).toBe(true);
    expect(bella.isApprover).toBe(true);
  });

  test("a plain staff member is not an approver", async () => {
    const t = await setup();
    const me = (await asUser(t, RACHEL).query(api.directory.me, {}))!;
    expect(me.isApprover).toBe(false);
    expect(me.isAdmin).toBe(false);
  });
});

describe("nameForEmail", () => {
  test("prefers a profile name, falls back to the directory, else null", async () => {
    const t = await setup();
    expect(await t.query(api.directory.nameForEmail, { email: RACHEL })).toBeNull(); // unauth

    // No profile name and no directory entry -> null.
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBeNull();

    // Directory fallback.
    await t.run((ctx) => ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry H" }));
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBe("Henry H");

    // A profile name wins over the directory.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", HENRY).eq("year", YEAR))
        .unique();
      if (profile) await ctx.db.patch("staffProfiles", profile._id, { name: "Profile Henry" });
    });
    expect(
      await asUser(t, RACHEL).query(api.directory.nameForEmail, { email: HENRY })
    ).toBe("Profile Henry");
  });
});

describe("availableYears", () => {
  test("includes structure years plus the current and next staff years, newest first, null when unauth", async () => {
    const t = await setup();
    expect(await t.query(api.directory.availableYears, {})).toBeNull();

    await t.run((ctx) => ctx.db.insert("divisions", { year: 2020, name: "Old" }));
    const years = (await asUser(t, RACHEL).query(api.directory.availableYears, {}))!;
    expect(years).toContain(2020);
    expect(years).toContain(YEAR);
    expect(years).toContain(YEAR + 1);
    // Sorted descending.
    expect([...years].sort((a, b) => b - a)).toEqual(years);
  });
});

describe("orgChart", () => {
  test("uses directory name as fallback when profile and user have no name", async () => {
    const t = await setup();
    // HENRY has a staff profile (head of Marketing) but no name anywhere.
    // A directoryUsers entry should be used as the name fallback.
    await t.run((ctx) =>
      ctx.db.insert("directoryUsers", { email: HENRY, name: "Henry from Directory" })
    );
    const chart = (await asUser(t, RACHEL).query(api.directory.orgChart, {}))!;
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing");
    expect(marketing?.head?.name).toBe("Henry from Directory");
  });
});
