import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DORMANT_AFTER_MS, fillLoading, watchHidden } from "./dormant";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const fakePage = () => {
  const target = new EventTarget();
  const page = Object.assign(target, { hidden: false });
  const hide = (hidden: boolean) => {
    page.hidden = hidden;
    target.dispatchEvent(new Event("visibilitychange"));
  };
  return { page, hide };
};

test("a page hidden for the whole wait goes dormant, and wakes the moment it shows", () => {
  const { page, hide } = fakePage();
  const seen: boolean[] = [];
  watchHidden(page, DORMANT_AFTER_MS, (dormant) => seen.push(dormant));
  expect(seen).toEqual([false]);
  hide(true);
  vi.advanceTimersByTime(DORMANT_AFTER_MS - 1);
  expect(seen).toEqual([false]);
  vi.advanceTimersByTime(1);
  expect(seen).toEqual([false, true]);
  hide(false);
  expect(seen).toEqual([false, true, false]);
});

test("a quick look away never goes dormant", () => {
  const { page, hide } = fakePage();
  const seen: boolean[] = [];
  watchHidden(page, DORMANT_AFTER_MS, (dormant) => seen.push(dormant));
  hide(true);
  vi.advanceTimersByTime(DORMANT_AFTER_MS / 2);
  hide(false);
  vi.advanceTimersByTime(DORMANT_AFTER_MS * 2);
  expect(seen).toEqual([false, false]);
});

test("a page that starts hidden goes dormant after the wait, and stopping cancels it", () => {
  const { page } = fakePage();
  page.hidden = true;
  const seen: boolean[] = [];
  const stop = watchHidden(page, 1000, (dormant) => seen.push(dormant));
  stop();
  vi.advanceTimersByTime(5000);
  expect(seen).toEqual([]);
  const stopAgain = watchHidden(page, 1000, (dormant) => seen.push(dormant));
  vi.advanceTimersByTime(1000);
  expect(seen).toEqual([true]);
  stopAgain();
});

test("rows still loading after a wake show what was there before", () => {
  const live = { a: 1, b: undefined, c: undefined };
  expect(fillLoading(live, { a: 0, b: 2 })).toEqual({ a: 1, b: 2, c: undefined });
  expect(fillLoading(live, undefined)).toBe(live);
  const loaded = { a: 1 };
  expect(fillLoading(loaded, { a: 0 })).toBe(loaded);
});
