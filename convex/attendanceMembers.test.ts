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
  const expectSingleLinkedRow = async (
    memberEmail: string,
    { staffEmail }: { staffEmail?: string } = {}
  ) => {
    const { t, leader } = await setup();
    const memberId = await t.run((ctx) =>
      ctx.db.insert("attendanceMembers", {
        name: "Leader Alias",
        email: memberEmail,
        ...(staffEmail ? { staffEmail } : {}),
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

  test("links via staffEmail when the plain email differs", async () => {
    await expectSingleLinkedRow("personal@example.com", { staffEmail: LEADER });
  });
});
