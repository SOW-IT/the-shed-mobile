import { describe, expect, test } from "vitest";
import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { asUser, type T } from "../test/convexFixture";
import { BELLA, FIONA, HENRY, RACHEL, reimbursementSetup } from "../test/requestFlows";

const REQUESTS = 40;
const COMMENTED = [3, 17];

const readCost = (
  t: T,
  email: string,
  query: FunctionReference<"query">,
  args: Record<string, unknown>
) =>
  asUser(t, email).run(async (ctx) => {
    const before = await ctx.meta.getTransactionMetrics();
    const value: unknown = await ctx.runQuery(query, args);
    const after = await ctx.meta.getTransactionMetrics();
    return { value, documentsRead: after.documentsRead.used - before.documentsRead.used };
  });

async function fortyRequestsTwoThreads() {
  const t = await reimbursementSetup();
  for (let i = 0; i < REQUESTS; i++) {
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: `r${i}`, amount: 100 + i });
  }
  const ids: Id<"requests">[] = (await asUser(t, RACHEL).query(api.requests.myRequests, {}))!.map(
    (request) => request._id
  );
  for (const id of ids.slice(0, REQUESTS / 2)) {
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: id, step: "hod" });
  }
  for (const index of COMMENTED) {
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: ids[index], body: "one" });
    await asUser(t, RACHEL).mutation(api.comments.add, { requestId: ids[index], body: "two" });
  }
  for (const id of ids.slice(0, 12)) {
    await asUser(t, BELLA).mutation(api.comments.markRead, { requestId: id });
  }
  return { t, ids };
}

describe("unread comment counts over a review list", () => {
  test("requests without comments cost no request or approval reads", async () => {
    const { t, ids } = await fortyRequestsTwoThreads();
    for (const [email, expected] of [[HENRY, 4], [BELLA, 2], [FIONA, 4]] as const) {
      const total = await readCost(t, email, api.comments.unreadTotalForRequests, { requestIds: ids });
      expect(total.value).toBe(expected);
      expect(total.documentsRead).toBeLessThan(REQUESTS);
      const counts = await readCost(t, email, api.comments.unreadCountsForRequests, { requestIds: ids });
      expect(Object.values(counts.value as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(expected);
      expect(counts.documentsRead).toBeLessThan(REQUESTS);
    }
  });

  test("a thread the caller can't see still counts nothing", async () => {
    const { t, ids } = await fortyRequestsTwoThreads();
    const outsider = await readCost(t, "oscar@sow.org.au", api.comments.unreadTotalForRequests, {
      requestIds: ids,
    });
    expect(outsider.value).toBe(0);
  });
});
