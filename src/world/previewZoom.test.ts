import { describe, expect, it } from "vitest";
import {
  PINCH_IDLE,
  clampZoom,
  keyZoom,
  manualZoomFor,
  pinchLift,
  pinchMove,
  pinchZoom,
  sliderZoom,
  wheelZoom,
  zoomFrame,
  zoomLimits,
  zoomOf,
} from "./previewZoom";

const HEIGHT = 300;
const full = { s: 180, y: 260 };
const eyes = { s: 480, y: 520 };
const limits = zoomLimits(full, eyes, 640);
const view = { full, tab: eyes, height: HEIGHT, limits };

describe("previewZoom", () => {
  it("runs from the whole character to closer than the tab's own shot", () => {
    expect(limits).toEqual({ low: 180, high: 640 });
    expect(zoomLimits(full, { s: 700, y: 0 }, 640)).toEqual({ low: 180, high: 700 });
    expect(zoomLimits({ s: 200, y: 0 }, { s: 150, y: 0 }, 640).low).toBe(150);
  });

  it("clamps the zoom to its limits, with no overscroll", () => {
    expect(clampZoom(-0.3)).toBe(0);
    expect(clampZoom(1.4)).toBe(1);
    expect(clampZoom(0.25)).toBe(0.25);
    expect(zoomOf(100, limits)).toBe(0);
    expect(zoomOf(900, limits)).toBe(1);
    expect(zoomFrame(view, -2).s).toBeCloseTo(180);
    expect(zoomFrame(view, 3).s).toBeCloseTo(640);
  });

  it("shows the tab's own shot with no manual zoom, and at the tab's zoom", () => {
    expect(zoomFrame(view, null)).toEqual(eyes);
    const own = zoomFrame(view, zoomOf(eyes.s, limits));
    expect(own.s).toBeCloseTo(eyes.s);
    expect(own.y).toBeCloseTo(eyes.y);
  });

  it("zoomed all the way out, frames the whole character as the Body tab does", () => {
    const out = zoomFrame(view, 0);
    expect(out.s).toBeCloseTo(full.s);
    expect(out.y).toBeCloseTo(full.y);
  });

  it("zooming in past the tab's shot keeps the part in the middle of the preview", () => {
    const focus = (frame: { s: number; y: number }) => (frame.y - HEIGHT / 2) / frame.s;
    const closer = zoomFrame(view, 1);
    expect(closer.s).toBeCloseTo(640);
    expect(focus(closer)).toBeCloseTo(focus(eyes));
  });

  it("zooming in on a shot with its own focus keeps that point where the shot put it", () => {
    const face = { s: 280, y: 400, focus: 0.9 };
    const faceView = { full, tab: face, height: HEIGHT, limits: zoomLimits(full, face, 640) };
    const at = (frame: { s: number; y: number }) => frame.y - 0.9 * frame.s;
    const closer = zoomFrame(faceView, 1);
    expect(closer.s).toBeCloseTo(640);
    expect(at(closer)).toBeCloseTo(at(face));
    const own = zoomFrame(faceView, zoomOf(face.s, faceView.limits));
    expect(own.y).toBeCloseTo(face.y);
    const out = zoomFrame(faceView, 0);
    expect(out.y).toBeCloseTo(full.y);
  });

  it("zooming out moves smoothly from the part toward the whole character", () => {
    const start = zoomOf(eyes.s, limits);
    const frames = [1, 0.75, 0.5, 0.25, 0].map((k) => zoomFrame(view, start * k));
    for (const [i, frame] of frames.slice(1).entries()) {
      expect(frame.s).toBeLessThan(frames[i].s);
      expect(frame.y).toBeLessThan(frames[i].y);
    }
  });

  it("turns a pinch's spread into zoom, doubling the spread the same everywhere", () => {
    const start = zoomOf(240, limits);
    const doubled = pinchZoom(start, 2, limits);
    expect(zoomFrame(view, doubled).s).toBeCloseTo(480);
    expect(pinchZoom(start, 1, limits)).toBeCloseTo(start);
    expect(zoomFrame(view, pinchZoom(start, 0.5, limits)).s).toBeCloseTo(180);
    expect(pinchZoom(start, 10, limits)).toBe(1);
    expect(pinchZoom(start, 0.01, limits)).toBe(0);
    expect(pinchZoom(start, 0, limits)).toBeCloseTo(start);
    expect(pinchZoom(start, Number.NaN, limits)).toBeCloseTo(start);
    expect(pinchZoom(0.4, 3, { low: 200, high: 200 })).toBe(0.4);
  });

  it("turns a ctrl-scroll or trackpad pinch on the web into zoom", () => {
    const start = 0.5;
    expect(wheelZoom(start, -50, limits)).toBeGreaterThan(start);
    expect(wheelZoom(start, 50, limits)).toBeLessThan(start);
    expect(wheelZoom(start, 0, limits)).toBeCloseTo(start);
    expect(wheelZoom(start, -100000, limits)).toBe(1);
  });

  it("reads the slider top as closest and the bottom as the whole character", () => {
    expect(sliderZoom(0, 200)).toBe(1);
    expect(sliderZoom(200, 200)).toBe(0);
    expect(sliderZoom(50, 200)).toBe(0.75);
    expect(sliderZoom(-20, 200)).toBe(1);
    expect(sliderZoom(260, 200)).toBe(0);
    expect(sliderZoom(10, 0)).toBeNull();
  });

  it("steps with the arrow keys, pages and jumps to either end", () => {
    expect(keyZoom(0.5, "ArrowUp")).toBeCloseTo(0.55);
    expect(keyZoom(0.5, "ArrowRight")).toBeCloseTo(0.55);
    expect(keyZoom(0.5, "ArrowDown")).toBeCloseTo(0.45);
    expect(keyZoom(0.5, "ArrowLeft")).toBeCloseTo(0.45);
    expect(keyZoom(0.5, "PageUp")).toBeCloseTo(0.7);
    expect(keyZoom(0.5, "PageDown")).toBeCloseTo(0.3);
    expect(keyZoom(0.5, "Home")).toBe(0);
    expect(keyZoom(0.5, "End")).toBe(1);
    expect(keyZoom(0.98, "ArrowUp")).toBe(1);
    expect(keyZoom(0.02, "ArrowDown")).toBe(0);
    expect(keyZoom(0.5, "a")).toBeNull();
  });

  it("drops a manual zoom when the tab changes, back to that tab's own shot", () => {
    expect(manualZoomFor(null, "eyes")).toBeNull();
    expect(manualZoomFor({ shot: "eyes", zoom: 0.8 }, "eyes")).toBe(0.8);
    expect(manualZoomFor({ shot: "eyes", zoom: 0.8 }, "mouth")).toBeNull();
    expect(zoomFrame(view, manualZoomFor({ shot: "face", zoom: 0.8 }, "eyes"))).toEqual(eyes);
  });

  it("never gives NaN for a preview too short to frame anything", () => {
    const broken = [
      { low: 0, high: 300 },
      { low: -40, high: 300 },
      { low: 200, high: Number.POSITIVE_INFINITY },
      { low: Number.NaN, high: 300 },
    ];
    for (const bad of broken) {
      const tab = { s: bad.low, y: 10 };
      expect(zoomOf(150, bad)).toBe(0);
      expect(zoomFrame({ full: tab, tab, height: 12, limits: bad }, 0.5)).toEqual(tab);
      expect(pinchZoom(0.3, 2, bad)).toBe(0.3);
      expect(wheelZoom(0.3, 50, bad)).toBe(0.3);
    }
    expect(zoomOf(0, limits)).toBe(0);
    expect(zoomOf(-5, limits)).toBe(0);
  });

  it("clamps a huge scroll either way instead of ignoring it", () => {
    expect(wheelZoom(0.5, 1e9, limits)).toBe(0);
    expect(wheelZoom(0.5, -1e9, limits)).toBe(1);
    expect(wheelZoom(0.5, Number.NaN, limits)).toBe(0.5);
    expect(wheelZoom(0.5, Number.POSITIVE_INFINITY, limits)).toBe(0.5);
  });

  describe("pinch", () => {
    const at = (zoom: number) => ({ zoom, limits });

    it("starts on the first two-finger move with a spread, and zooms from there", () => {
      const start = pinchMove(PINCH_IDLE, { fingers: 2, spread: 100, ...at(0.4) });
      expect(start.began).toBe(true);
      expect(start.zoom).toBeNull();
      expect(start.state).toEqual({ pinched: true, base: { spread: 100, zoom: 0.4 } });
      const wider = pinchMove(start.state, { fingers: 2, spread: 200, ...at(0.9) });
      expect(wider.began).toBe(false);
      expect(wider.zoom).toBeCloseTo(pinchZoom(0.4, 2, limits));
    });

    it("waits for a spread when two fingers land on the same spot", () => {
      const same = pinchMove(PINCH_IDLE, { fingers: 2, spread: 0, ...at(0.4) });
      expect(same.state).toEqual(PINCH_IDLE);
      expect(same.began).toBe(false);
      const apart = pinchMove(same.state, { fingers: 2, spread: 60, ...at(0.4) });
      expect(apart.began).toBe(true);
      expect(apart.state.base).toEqual({ spread: 60, zoom: 0.4 });
      const after = pinchMove(apart.state, { fingers: 2, spread: 120, ...at(0.4) });
      expect(after.zoom).toBeGreaterThan(0.4);
    });

    it("lifting one finger and putting it back carries on from the zoom you reached", () => {
      let state = pinchMove(PINCH_IDLE, { fingers: 2, spread: 100, ...at(0.2) }).state;
      const reached = pinchMove(state, { fingers: 2, spread: 250, ...at(0.2) }).zoom ?? 0;
      expect(reached).toBeGreaterThan(0.2);
      state = pinchLift(state, 1);
      expect(state).toEqual({ pinched: true, base: null });
      const regrab = pinchMove(state, { fingers: 2, spread: 80, ...at(reached) });
      expect(regrab.began).toBe(false);
      expect(regrab.zoom).toBeNull();
      expect(regrab.state.base).toEqual({ spread: 80, zoom: reached });
      expect(pinchMove(regrab.state, { fingers: 2, spread: 80, ...at(reached) }).zoom).toBeCloseTo(reached);
    });

    it("one finger left after a pinch neither zooms nor restarts the pinch", () => {
      const state = pinchMove(PINCH_IDLE, { fingers: 2, spread: 100, ...at(0.5) }).state;
      const one = pinchMove(state, { fingers: 1, spread: 0, ...at(0.5) });
      expect(one.zoom).toBeNull();
      expect(one.began).toBe(false);
      expect(one.state).toEqual({ pinched: true, base: null });
      expect(pinchLift(state, 2)).toBe(state);
      expect(pinchLift(PINCH_IDLE, 0)).toEqual(PINCH_IDLE);
    });
  });
});
