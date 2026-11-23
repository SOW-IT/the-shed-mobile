import { describe, expect, test } from "vitest";
import { ACTIVITY_EMAIL_LIMIT, activityBatches } from "./userActivity";

describe("activityBatches", () => {
  test("no emails, no batches", () => {
    expect(activityBatches([])).toEqual([]);
  });

  test("splits past the server's limit so nobody is dropped", () => {
    const emails = Array.from({ length: ACTIVITY_EMAIL_LIMIT + 1 }, (_, i) => `p${i}@sow.org.au`);
    const batches = activityBatches(emails);
    expect(batches.map((batch) => batch.length)).toEqual([ACTIVITY_EMAIL_LIMIT, 1]);
    expect(batches.flat()).toEqual(emails);
  });
});
