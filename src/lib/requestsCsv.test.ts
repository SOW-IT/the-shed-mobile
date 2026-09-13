import { describe, expect, test } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import { buildRequestsCsv } from "./requestsCsv";

const request = (overrides: Partial<Doc<"requests">> = {}): Doc<"requests"> =>
  ({
    _id: "r1" as Doc<"requests">["_id"],
    _creationTime: Date.UTC(2026, 2, 1),
    requesterEmail: "rachel@sow.org.au",
    department: "Marketing",
    description: "Stickers",
    amount: 30.299999999999997,
    approvedByHOD: "APPROVED",
    approvedByBudgetManager: "APPROVED",
    approvedByFinanceHead: "APPROVED",
    ...overrides,
  }) as Doc<"requests">;

describe("buildRequestsCsv", () => {
  test("writes money with two decimals, never raw float drift", () => {
    const csv = buildRequestsCsv([
      request({
        receipt: { totalAmount: 30.299999999999997, recipients: [] },
        paid: true,
        paidAmount: 10.1,
      }),
    ]);
    const [, row] = csv.split("\r\n");
    const cells = row.split(",");
    expect(cells[5]).toBe("30.30");
    expect(cells[12]).toBe("30.30");
    expect(cells[13]).toBe("Yes");
    expect(cells[14]).toBe("10.10");
  });

  test("leaves optional money cells empty", () => {
    const [, row] = buildRequestsCsv([request()]).split("\r\n");
    const cells = row.split(",");
    expect(cells[12]).toBe("");
    expect(cells[14]).toBe("");
  });
});
