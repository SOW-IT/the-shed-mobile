/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());

const ADMIN = "admin@sow.org.au";
const LEADER = "leader@sow.org.au";
const USYD = "University of Sydney";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year: YEAR, name: USYD });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year: YEAR,
    roles: ["Student Leader"],
    university: USYD,
  });
  return { t, admin, leader: asUser(t, LEADER) };
}

describe("attendanceMembers.list — staff vs member classification", () => {
  test("a profile with no assignment this year is listed as a Member", async () => {
    const { t, leader } = await setup();
    // Someone who was staff previously but carries no assignment this staff year.
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", {
        email: "former@sow.org.au",
        year: YEAR,
        name: "Former Staff",
        assignments: [],
      })
    );

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const byEmail = new Map(page.map((r) => [r.email, r]));

    // Active leader (has a role) stays staff…
    expect(byEmail.get(LEADER)?.kind).toBe("staff");
    // …the role-less former staff is now a Member, but still keyed by email so
    // their metadata stays editable.
    const former = byEmail.get("former@sow.org.au");
    expect(former?.kind).toBe("member");
    expect(former?.roles).toEqual([]);
  });
});

describe("attendanceMembers.list — staff profile ↔ member linking", () => {
  // A person who is both a staff profile and an attendanceMember must appear as
  // ONE combined row (the profile, carrying the member's metadata as `memberId`)
  // — never two rows. The link is by canonical email, robust to the SOW domain
  // spellings, case, and stray whitespace.
  const expectSingleLinkedRow = async (memberEmail: string) => {
    const { t, leader } = await setup();
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", {
        name: "Leader Alias",
        email: memberEmail,
        metadata: {},
      })
    );

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      paginationOpts: { numItems: 100, cursor: null },
    });

    const leaderRows = page.filter((r) => r.email === LEADER);
    // Exactly one row for the leader — the staff profile, linked to the member.
    expect(leaderRows).toHaveLength(1);
    expect(leaderRows[0].kind).toBe("staff");
    expect(leaderRows[0].memberId).toBe(memberId);
    // The alias member is not surfaced as its own separate row.
    expect(page.some((r) => r.memberId === memberId && r.email !== LEADER)).toBe(
      false
    );
  };

  test("links by plain email (exact match)", async () => {
    await expectSingleLinkedRow(LEADER);
  });

  test("links across the two SOW staff domains", async () => {
    // Profile is leader@sow.org.au; the member row uses the legacy domain.
    await expectSingleLinkedRow("leader@sowaustralia.com");
  });

  test("links despite case and surrounding whitespace", async () => {
    await expectSingleLinkedRow("  Leader@SOW.ORG.AU  ");
  });
});

describe("attendanceMembers.list — filters and sort", () => {
  const metadataField = async (
    admin: ReturnType<typeof asUser>,
    key: string
  ) => {
    await admin.mutation(api.attendanceMetadata.ensureDefaults, {});
    const fields = await admin.query(api.attendanceMetadata.list, {});
    const field = fields.find((f) => f.key === key);
    if (!field) throw new Error(`metadata field ${key} not seeded`);
    return field;
  };

  test("Staff role filter includes staff whose only role is a custom one", async () => {
    const { t, admin, leader } = await setup();
    // The role catalog is data-driven — an admin-added role is staff-side too.
    await admin.mutation(api.admin.upsertRole, {
      year: YEAR,
      name: "Media Coordinator",
    });
    // Custom roles are department-scoped by default, so give it a home.
    await admin.mutation(api.admin.upsertDivision, { year: YEAR, name: "Ministry" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Media",
      division: "Ministry",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "media@sow.org.au",
      year: YEAR,
      roles: ["Media Coordinator"],
      department: "Media",
    });

    const roleField = await metadataField(admin, "Role");
    const staffOptionId = Object.entries(roleField.values ?? {}).find(
      ([, label]) => label === "Staff"
    )![0];

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [roleField._id]: [staffOptionId] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    const emails = page.map((r) => r.email);
    // Custom-role staff match the Staff bucket…
    expect(emails).toContain("media@sow.org.au");
    // …while a campus-role holder still doesn't.
    expect(emails).not.toContain(LEADER);
    void t;
  });

  test("Year filter puts unresolvable stored values under Unselected", async () => {
    const { t, admin, leader } = await setup();
    const yearField = await metadataField(admin, "Year");
    await t.run(async (ctx) => {
      // "999" is neither a commencement year (2000–2100) nor a level (1–15),
      // so it displays as blank — it must land under "Unselected", not vanish
      // from every Year option.
      await ctx.db.insert("attendanceMembers", {
        name: "Legacy Year",
        metadata: { [yearField._id]: "999" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "No Year",
        metadata: {},
      });
    });

    const unset = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: ["unset"] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    const names = unset.page.map((r) => r.name);
    expect(names).toContain("Legacy Year");
    expect(names).toContain("No Year");

    // And it doesn't leak into a real level's filter.
    const firstYears = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      filters: { [yearField._id]: ["1"] },
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(firstYears.page.map((r) => r.name)).not.toContain("Legacy Year");
  });

  test("sorting by a select field orders by label, not option id", async () => {
    const { t, leader } = await setup();
    const fieldId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("attendanceMetadata", {
        key: "Team",
        type: "select",
        order: 10,
        // Ids deliberately ordered opposite to their labels.
        values: { "1": "Zebra", "2": "Apple" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "On Zebra",
        metadata: { [id]: "1" },
      });
      await ctx.db.insert("attendanceMembers", {
        name: "On Apple",
        metadata: { [id]: "2" },
      });
      return id;
    });

    const { page } = await leader.query(api.attendanceMembers.list, {
      year: YEAR,
      sortKey: fieldId,
      sortAsc: true,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const apple = page.findIndex((r) => r.name === "On Apple");
    const zebra = page.findIndex((r) => r.name === "On Zebra");
    expect(apple).toBeGreaterThanOrEqual(0);
    expect(zebra).toBeGreaterThanOrEqual(0);
    // "Apple" sorts before "Zebra" even though its option id ("2") is larger.
    expect(apple).toBeLessThan(zebra);
  });
});
