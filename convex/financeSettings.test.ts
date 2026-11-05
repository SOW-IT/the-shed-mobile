/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";
const FIONA = "fiona@sow.org.au";
const BELLA = "bella@sow.org.au";
const COVER = "cover@sow.org.au";
const SAM = "sam@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  for (const [email, department] of [
    [BELLA, "Finance"],
    [COVER, "Compliance"],
    [SAM, "Marketing"],
  ]) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, email, roles: ["Staff"], department });
  }
  await admin.mutation(api.admin.addDelegation, { year: YEAR, fromEmail: FIONA, toEmail: COVER });
  return { t, admin };
}

const role = (t: TestConvex<typeof schema>, email: string | null) =>
  (email ? asUser(t, email) : t).query(api.admin.financeSettingsRole, { year: YEAR });

describe("finance settings access", () => {
  test("the finance team sees the settings; the Finance Head, their cover and admins change them", async () => {
    const { t } = await setup();
    expect(await role(t, null)).toEqual({ canView: false, canEdit: false });
    expect(await role(t, SAM)).toEqual({ canView: false, canEdit: false });
    expect(await role(t, BELLA)).toEqual({ canView: true, canEdit: false });
    expect(await role(t, FIONA)).toEqual({ canView: true, canEdit: true });
    expect(await role(t, COVER)).toEqual({ canView: true, canEdit: true });
    expect(await role(t, ADMIN)).toEqual({ canView: true, canEdit: true });

    await expect(
      asUser(t, BELLA).mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 4000 })
    ).rejects.toThrow(/Only admins or the Finance Head/);
    await asUser(t, COVER).mutation(api.admin.setDirectorThreshold, { year: YEAR, amount: 4000 });
  });

  test("finance staff can read who's who, delegations and step timing; other staff can't", async () => {
    const { t } = await setup();
    const bella = asUser(t, BELLA);
    expect((await bella.query(api.admin.people, { year: YEAR }))!.map((p) => p.email)).toContain(SAM);
    expect((await bella.query(api.admin.listDelegations, { year: YEAR }))!.map((d) => d.toEmail)).toEqual([
      COVER,
    ]);
    expect(
      (await bella.query(api.admin.financeMembers, { year: YEAR }))!.map((m) => m.email).sort()
    ).toEqual([BELLA, FIONA]);
    expect(await bella.query(api.stepTiming.summary, { year: YEAR })).not.toBeNull();

    const sam = asUser(t, SAM);
    await expect(sam.query(api.admin.people, { year: YEAR })).rejects.toThrow(
      "Only admins and the finance team can view people."
    );
    await expect(sam.query(api.admin.listDelegations, { year: YEAR })).rejects.toThrow(
      "Only admins and the finance team can view delegations."
    );
    expect(await sam.query(api.admin.financeMembers, { year: YEAR })).toBeNull();
    expect(await sam.query(api.stepTiming.summary, { year: YEAR })).toBeNull();
  });
});
