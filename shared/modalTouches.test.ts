import { describe, expect, test } from "vitest";
import { touchBoundary } from "./modalTouches";

type TouchName = keyof typeof touchBoundary;
type Handlers = Partial<Record<TouchName, (event: { stopPropagation: () => void }) => void>>;

const bubble = (name: TouchName, path: Handlers[]) => {
  let stopped = false;
  const event = { stopPropagation: () => { stopped = true; } };
  for (const handlers of path) {
    if (stopped) return;
    handlers[name]?.(event);
  }
};

const pageScrollView = () => {
  const state = { touching: false };
  const handlers: Handlers = {
    onTouchStart: () => { state.touching = true; },
    onTouchEnd: () => { state.touching = false; },
    onTouchCancel: () => { state.touching = false; },
  };
  return { state, handlers };
};

describe("touchBoundary", () => {
  test("every touch event stops at the boundary", () => {
    for (const name of Object.keys(touchBoundary) as TouchName[]) {
      let stopped = 0;
      touchBoundary[name]({ stopPropagation: () => { stopped++; } });
      expect(stopped).toBe(1);
    }
  });

  test("without it, a page scroll view behind a sheet thinks a tap on the sheet touches it", () => {
    const page = pageScrollView();
    bubble("onTouchStart", [{}, {}, page.handlers]);
    expect(page.state.touching).toBe(true);
  });

  test("with it, a tap on the sheet's close button never reaches the page behind", () => {
    const page = pageScrollView();
    const closeButton: Handlers = {};
    const card: Handlers = {};
    for (const name of ["onTouchStart", "onTouchMove"] as TouchName[]) {
      bubble(name, [closeButton, card, touchBoundary, page.handlers]);
    }
    expect(page.state.touching).toBe(false);
  });

  test("views inside the sheet still get the touch", () => {
    const seen: TouchName[] = [];
    const list: Handlers = { onTouchStart: () => seen.push("onTouchStart"), onTouchEnd: () => seen.push("onTouchEnd") };
    bubble("onTouchStart", [list, touchBoundary]);
    bubble("onTouchEnd", [list, touchBoundary]);
    expect(seen).toEqual(["onTouchStart", "onTouchEnd"]);
  });
});
