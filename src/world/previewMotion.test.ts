import { describe, expect, it } from "vitest";
import {
  PREVIEW_AUTO_START_MS,
  PREVIEW_GLIDE_MS,
  previewAutoWaitMs,
  previewEaseInOut,
  previewGoalMoved,
  previewNeedsFrame,
  type PreviewGlide,
  type PreviewSpin,
} from "./previewMotion";

const settledGlide = (at = 0): PreviewGlide => ({
  from: { s: 100, y: 200 },
  to: { s: 100, y: 200 },
  at,
  now: { s: 100, y: 200 },
});

const idleSpin = (openedAt = 0): PreviewSpin => ({
  down: false,
  lastX: 0,
  lastAt: openedAt,
  velocity: 0,
  heading: 0,
  openedAt,
  touched: false,
});

describe("previewMotion", () => {
  it("stops requesting frames when stationary on close-up tabs", () => {
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: idleSpin(0),
        target: { s: 100, y: 200, still: false },
        closeUp: true,
        now: 10_000,
      })
    ).toBe(false);
  });

  it("requests frames while gliding to a new shot unless reduced motion is on", () => {
    expect(
      previewNeedsFrame({
        glide: settledGlide(1000),
        spin: idleSpin(0),
        target: { s: 100, y: 200, still: false },
        closeUp: true,
        now: 1000 + PREVIEW_GLIDE_MS - 1,
      })
    ).toBe(true);

    expect(
      previewNeedsFrame({
        glide: settledGlide(1000),
        spin: idleSpin(0),
        target: { s: 100, y: 200, still: true },
        closeUp: true,
        now: 1000 + PREVIEW_GLIDE_MS - 1,
      })
    ).toBe(false);
  });

  it("requests frames when target changes or flick momentum is active", () => {
    expect(previewGoalMoved(settledGlide(0), { s: 120, y: 200 })).toBe(true);
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: { ...idleSpin(0), velocity: 1.5, touched: true },
        target: { s: 100, y: 200, still: false },
        closeUp: true,
        now: 10_000,
      })
    ).toBe(true);
  });

  it("turns back to front on close-up tabs and stops once facing front", () => {
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: { ...idleSpin(0), heading: 0.4 },
        target: { s: 100, y: 200, still: false },
        closeUp: true,
        now: 10_000,
      })
    ).toBe(true);
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: { ...idleSpin(0), heading: Math.PI * 2 },
        target: { s: 100, y: 200, still: false },
        closeUp: true,
        now: 10_000,
      })
    ).toBe(false);
  });

  it("defers auto-turn on full-body tabs until PREVIEW_AUTO_START_MS", () => {
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: idleSpin(1000),
        target: { s: 100, y: 200, still: false },
        closeUp: false,
        now: 1000 + PREVIEW_AUTO_START_MS - 500,
      })
    ).toBe(false);
    expect(
      previewAutoWaitMs({
        spin: idleSpin(1000),
        closeUp: false,
        still: false,
        now: 1000 + PREVIEW_AUTO_START_MS - 500,
      })
    ).toBe(500);
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: idleSpin(1000),
        target: { s: 100, y: 200, still: false },
        closeUp: false,
        now: 1000 + PREVIEW_AUTO_START_MS,
      })
    ).toBe(true);
    expect(
      previewAutoWaitMs({
        spin: idleSpin(1000),
        closeUp: false,
        still: true,
        now: 1000,
      })
    ).toBeNull();
  });

  it("stops requesting frames while a finger is down or after touched on full-body", () => {
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: { ...idleSpin(0), down: true, velocity: 2 },
        target: { s: 100, y: 200, still: false },
        closeUp: false,
        now: 10_000,
      })
    ).toBe(false);
    expect(
      previewNeedsFrame({
        glide: settledGlide(0),
        spin: { ...idleSpin(0), touched: true },
        target: { s: 100, y: 200, still: false },
        closeUp: false,
        now: 10_000,
      })
    ).toBe(false);
  });

  it("eases smoothly between 0 and 1", () => {
    expect(previewEaseInOut(0)).toBe(0);
    expect(previewEaseInOut(0.5)).toBe(0.5);
    expect(previewEaseInOut(1)).toBe(1);
  });
});
