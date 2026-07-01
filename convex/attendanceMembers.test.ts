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
