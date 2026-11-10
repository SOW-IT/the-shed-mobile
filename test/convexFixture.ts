import { convexTest, type TestConvex } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import type { ImportGlobFunction } from "vite/types/importGlob.d.ts";

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

export type T = TestConvex<typeof schema>;
export type Caller = ReturnType<T["withIdentity"]>;

export const modules = import.meta.glob("../convex/**/*.ts");

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const PINNED_NOW = staffYearStartMs(staffYearForDate(new Date())) + 150 * DAY;
export const YEAR = staffYearForDate(new Date(PINNED_NOW));

export const ADMIN = "admin@sow.org.au";
export const LEADER = "leader@sow.org.au";
export const STAFF = "staff@sow.org.au";
export const OUTSIDER = "outsider@sow.org.au";
export const USYD = "University of Sydney";
export const MACQ = "Macquarie University";
export const UNSW = "University of New South Wales";

export const newConvex = () => convexTest(schema, modules);

export const asUser = (t: T, email: string) => t.withIdentity({ email, subject: email, issuer: "test" });

export function pinClock(now = PINNED_NOW) {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

export async function seeded(adminEmail = ADMIN) {
  const t = newConvex();
  await t.mutation(internal.admin.seed, { adminEmail });
  return t;
}

export async function campusSetup(year = YEAR) {
  const t = await seeded();
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertUniversity, { year, name: USYD });
  await admin.mutation(api.admin.upsertUniversity, { year, name: MACQ });
  await admin.mutation(api.admin.upsertDivision, { year, name: "Ministry" });
  await admin.mutation(api.admin.upsertDepartment, { year, name: "Missions", division: "Ministry" });
  await admin.mutation(api.admin.setStaffProfile, {
    email: LEADER,
    year,
    roles: ["Student Leader"],
    university: USYD,
  });
  await admin.mutation(api.admin.setStaffProfile, { email: STAFF, year, roles: ["Staff"], department: "Missions" });
  return t;
}

export async function memberOf(t: T, email: string, year = YEAR) {
  const profile = await t.run((ctx) =>
    ctx.db
      .query("staffProfiles")
      .withIndex("by_email_and_year", (q) => q.eq("email", email).eq("year", year))
      .first()
  );
  if (!profile?.memberId) throw new Error(`No member linked to ${email} in ${year}`);
  return profile.memberId;
}

export const eventWindow = (daysAgo = 0, length = HOUR) => {
  const dateStart = Date.now() - daysAgo * DAY;
  return { dateStart, dateEnd: dateStart + length };
};

type EventFields = FunctionArgs<typeof api.events.create>;

export const createEvent = (who: Caller, fields: Partial<EventFields> = {}): Promise<Id<"events">> => {
  const dateStart = fields.dateStart ?? Date.now();
  return who.mutation(api.events.create, {
    name: "E",
    subgroups: [USYD],
    ...fields,
    dateStart,
    dateEnd: fields.dateEnd ?? dateStart + HOUR,
  });
};

export const notificationsFor = (t: T, email: string) =>
  t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect()
  );

export const storedReceipt = async (t: T) => ({
  storageId: await t.run((ctx) => ctx.storage.store(new Blob(["receipt"], { type: "application/pdf" }))),
  name: "receipt.pdf",
});
