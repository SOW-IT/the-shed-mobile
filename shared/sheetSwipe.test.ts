import { describe, expect, test } from "vitest";
import {
  isSheetDrag,
  PULL_CLOSE_DISTANCE,
  pullCloses,
  sheetDragOffset,
  SWIPE_CLOSE_DISTANCE,
  swipeCloses,
} from "./sheetSwipe";

describe("isSheetDrag", () => {
  test("a move mostly down is a drag", () => {
    expect(isSheetDrag(2, 12)).toBe(true);
  });
  test("a tap's small wobble is not", () => {
    expect(isSheetDrag(0, 5)).toBe(false);
  });
  test("a sideways or upward move is not", () => {
    expect(isSheetDrag(20, 12)).toBe(false);
    expect(isSheetDrag(0, -30)).toBe(false);
  });
});

describe("sheetDragOffset", () => {
  test("follows the finger down and resists up", () => {
    expect(sheetDragOffset(80)).toBe(80);
    expect(sheetDragOffset(-40)).toBe(-10);
  });
});

describe("swipeCloses", () => {
  test("a long slow drag closes", () => {
    expect(swipeCloses(SWIPE_CLOSE_DISTANCE + 1, 0)).toBe(true);
  });
  test("a short flick down closes", () => {
    expect(swipeCloses(30, 1.2)).toBe(true);
  });
  test("a short slow drag springs back", () => {
    expect(swipeCloses(60, 0.2)).toBe(false);
  });
  test("a fast jitter of a few points springs back", () => {
    expect(swipeCloses(10, 2)).toBe(false);
  });
});

describe("pullCloses", () => {
  test("pulling the list well past its top closes", () => {
    expect(pullCloses(-PULL_CLOSE_DISTANCE - 1)).toBe(true);
  });
  test("a bounce at the top or a scrolled list does not", () => {
    expect(pullCloses(-20)).toBe(false);
    expect(pullCloses(300)).toBe(false);
  });
});
