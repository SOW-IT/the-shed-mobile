import { describe, expect, test } from "vitest";
import { joinPages } from "./offlinePages";

const page = (ids: string[], next?: string) => ({ people: ids.map((id) => ({ id })), more: next !== undefined, next });

describe("joining the offline list's pages", () => {
  test("nothing until the first page comes", () => {
    expect(joinPages([undefined])).toBeUndefined();
  });

  test("pages in order, each person once, and the cursor for Show more", () => {
    const joined = joinPages([page(["a", "b"], "c1"), page(["b", "c"], "c2")]);
    expect(joined?.people.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(joined?.next).toBe("c2");
    expect(joined?.loading).toBe(false);
  });

  test("while the next page loads the shown ones stay and there's no Show more", () => {
    const joined = joinPages([page(["a"], "c1"), undefined]);
    expect(joined?.people.map((p) => p.id)).toEqual(["a"]);
    expect(joined?.loading).toBe(true);
    expect(joined?.next).toBeUndefined();
  });

  test("the last page says when there's nobody left", () => {
    expect(joinPages([page(["a"], "c1"), page(["b"])])?.next).toBeUndefined();
  });
});
