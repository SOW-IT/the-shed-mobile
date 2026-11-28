import { afterEach, describe, expect, test, vi } from "vitest";
import type { FunctionReference } from "convex/server";
import { api } from "./_generated/api";
import { staffYearStartMs } from "../shared/flow";
import { DAY, YEAR, asUser, newConvex, type T } from "../test/convexFixture";
import { BELLA, FIONA, HENRY, RACHEL, reimbursementSetup } from "../test/requestFlows";

// A late-November review list: last staff year is over and almost all of it is paid,
// and this staff year is two months old.
const LAST_YEAR_PAID = 160;
const LAST_YEAR_OPEN = 8;
const LAST_YEAR_DECLINED = 4;
const THIS_YEAR_PAID = 20;
const THIS_YEAR_OPEN = 12;

const readCost = (t: T, email: string, query: FunctionReference<"query">) =>
  asUser(t, email).run(async (ctx) => {
    const before = await ctx.meta.getTransactionMetrics();
    const value: unknown = await ctx.runQuery(query, {});
    const after = await ctx.meta.getTransactionMetrics();
    return {
      value,
      documentsRead: after.documentsRead.used - before.documentsRead.used,
      bytesRead: after.bytesRead.used - before.bytesRead.used,
    };
  });

const receipt = { totalAmount: 100, recipients: [{ accountName: "R", bsb: "062000", accountNumber: "12345678", amount: 100 }] };
const approved = { approvedByHOD: "APPROVED", approvedByBudgetManager: "APPROVED", approvedByFinanceHead: "APPROVED" } as const;

async function insertYear(t: T, year: number, paid: number, open: number, declined: number) {
  let n = 0;
  const insert = (fields: Record<string, unknown>) => {
    vi.setSystemTime(staffYearStartMs(year) + ++n * 60_000);
    return t.run((ctx) =>
      ctx.db.insert("requests", {
        requesterEmail: RACHEL,
        department: "Marketing",
        description: `request ${year}-${n}`,
        amount: 100,
        approvedByHOD: "PENDING",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
        ...fields,
      })
    );
  };
  for (let i = 0; i < paid; i++) {
    await insert({ ...approved, receipt, paid: true, paidAmount: 100, paidTime: staffYearStartMs(year) + DAY });
  }
  for (let i = 0; i < declined; i++) await insert({ approvedByHOD: "DECLINED", declineReason: "no" });
  for (let i = 0; i < open; i++) {
    const kind = i % 4;
    await insert(
      kind === 0 ? {} : kind === 1 ? { approvedByHOD: "APPROVED" } : kind === 2 ? approved : { ...approved, receipt, paid: false }
    );
  }
}

async function lateNovember() {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  // Document creation times only move forward, so the old requests go in first.
  const t = newConvex();
  await insertYear(t, YEAR - 1, LAST_YEAR_PAID, LAST_YEAR_OPEN, LAST_YEAR_DECLINED);
  await insertYear(t, YEAR, THIS_YEAR_PAID, THIS_YEAR_OPEN, 0);
  vi.setSystemTime(staffYearStartMs(YEAR) + 59 * DAY);
  return await reimbursementSetup(t);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("review queues skip paid requests", () => {
  test("reads stay near the open requests, not every request of two staff years", async () => {
    const t = await lateNovember();
    // Before the paid index every query here read all 204 requests (213-235 documents, ~85 KB).
    const unpaid = LAST_YEAR_OPEN + LAST_YEAR_DECLINED + THIS_YEAR_OPEN;
    const report: Record<string, { documentsRead: number; bytesRead: number }> = {};
    for (const [label, email, query] of [
      ["toReview (HOD)", HENRY, api.requests.toReview],
      ["toReview (Finance Head)", FIONA, api.requests.toReview],
      ["reviewed (Finance Head)", FIONA, api.requests.reviewed],
      ["waitingOnMe (Finance Head)", FIONA, api.waitingOnMe.summary],
      ["waitingOnMe (Budget Manager)", BELLA, api.waitingOnMe.summary],
    ] as const) {
      const { documentsRead, bytesRead } = await readCost(t, email, query);
      report[label] = { documentsRead, bytesRead };
    }
    if (process.env.READ_COST_REPORT) console.table(report);
    for (const [label, { documentsRead }] of Object.entries(report)) {
      expect(documentsRead, label).toBeLessThan(unpaid + 40);
    }
  });

  test("queues hold every open request of both years and nothing paid or declined", async () => {
    const t = await lateNovember();
    const queues = (await asUser(t, FIONA).query(api.requests.toReview, {}))!;
    const descriptions = (rows: { description: string }[]) => rows.map((r) => r.description).sort();
    expect(descriptions(queues.readyToPay)).toEqual(
      [`request ${YEAR - 1}-${LAST_YEAR_PAID + LAST_YEAR_DECLINED + 4}`, `request ${YEAR - 1}-${LAST_YEAR_PAID + LAST_YEAR_DECLINED + 8}`,
        `request ${YEAR}-${THIS_YEAR_PAID + 4}`, `request ${YEAR}-${THIS_YEAR_PAID + 8}`, `request ${YEAR}-${THIS_YEAR_PAID + 12}`].sort()
    );
    const hod = (await asUser(t, HENRY).query(api.requests.toReview, {}))!.hod;
    expect(hod).toHaveLength(LAST_YEAR_OPEN / 4 + THIS_YEAR_OPEN / 4);
    expect(hod.every((r) => r.canAct)).toBe(true);
    const all = (await asUser(t, FIONA).query(api.requests.allRequests, {}))!;
    expect(all).toHaveLength(THIS_YEAR_PAID + THIS_YEAR_OPEN + LAST_YEAR_OPEN);
    const times = all.map((r) => r._creationTime);
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });
});
