import { expect, test } from "vitest";
import { CHAT_ROLL, joinPages, splitAfter } from "./chatPages";

const lines = (ats: number[]) => ats.map((at) => ({ id: `l${at}`, at }));

test("the newer page goes first, the older page follows, and the limit keeps the newest", () => {
  expect(joinPages(lines([9, 8]), lines([5, 4, 3]), 10).map((line) => line.at)).toEqual([9, 8, 5, 4, 3]);
  expect(joinPages(lines([9, 8]), lines([5, 4, 3]), 3).map((line) => line.at)).toEqual([9, 8, 5]);
  expect(joinPages([], lines([5]), 3).map((line) => line.at)).toEqual([5]);
});

test("a line on both pages while the split moves shows once", () => {
  expect(joinPages(lines([9, 8]), lines([8, 7]), 10).map((line) => line.at)).toEqual([9, 8, 7]);
});

test("the split moves past the newest line once the newer page fills up", () => {
  expect(splitAfter(lines([5, 4]))).toBeNull();
  const full = lines(Array.from({ length: CHAT_ROLL }, (_, i) => 100 - i));
  expect(splitAfter(full)).toBe(101);
});
