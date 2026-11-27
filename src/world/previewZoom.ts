import type { PreviewShot } from "./previewMotion";

type ZoomFrame = { s: number; y: number };
type ZoomLimits = { low: number; high: number };
export type ManualZoom = { shot: PreviewShot; zoom: number } | null;

const KEY_STEP = 0.05;
const PAGE_STEP = 0.2;
const WHEEL_PX_PER_DOUBLING = 100 * Math.LN2;
export const ZOOM_A11Y_STEP = 0.1;

export const clampZoom = (zoom: number) => Math.max(0, Math.min(1, zoom));

const span = (limits: ZoomLimits) => (limits.high > limits.low ? Math.log(limits.high / limits.low) : 0);

export const zoomLimits = (full: ZoomFrame, tab: ZoomFrame, closest: number): ZoomLimits => {
  const low = Math.min(full.s, tab.s);
  return { low, high: Math.max(low, closest, tab.s) };
};

export const zoomOf = (s: number, limits: ZoomLimits) => {
  const range = span(limits);
  return range > 0 ? clampZoom(Math.log(s / limits.low) / range) : 0;
};

const scaleOf = (zoom: number, limits: ZoomLimits) => limits.low * Math.exp(clampZoom(zoom) * span(limits));

export const zoomFrame = (
  { full, tab, height, limits }: { full: ZoomFrame; tab: ZoomFrame; height: number; limits: ZoomLimits },
  zoom: number | null
): ZoomFrame => {
  if (zoom === null) return tab;
  const s = scaleOf(zoom, limits);
  const middle = height / 2;
  const tabFocus = (tab.y - middle) / tab.s;
  const fullFocus = (full.y - middle) / full.s;
  const widerThanTab = Math.log(tab.s / limits.low);
  const towardTab = s >= tab.s || widerThanTab <= 0 ? 1 : Math.log(s / limits.low) / widerThanTab;
  const focus = fullFocus + (tabFocus - fullFocus) * towardTab;
  return { s, y: middle + focus * s };
};

export const pinchZoom = (start: number, ratio: number, limits: ZoomLimits) => {
  const range = span(limits);
  if (!(ratio > 0) || range === 0) return clampZoom(start);
  return clampZoom(start + Math.log(ratio) / range);
};

export const wheelZoom = (zoom: number, deltaY: number, limits: ZoomLimits) =>
  pinchZoom(zoom, Math.exp(-deltaY / WHEEL_PX_PER_DOUBLING), limits);

export const sliderZoom = (y: number, length: number) => (length > 0 ? clampZoom(1 - y / length) : null);

const KEYS: Record<string, (zoom: number) => number> = {
  ArrowUp: (zoom) => zoom + KEY_STEP,
  ArrowRight: (zoom) => zoom + KEY_STEP,
  ArrowDown: (zoom) => zoom - KEY_STEP,
  ArrowLeft: (zoom) => zoom - KEY_STEP,
  PageUp: (zoom) => zoom + PAGE_STEP,
  PageDown: (zoom) => zoom - PAGE_STEP,
  Home: () => 0,
  End: () => 1,
};

export const keyZoom = (zoom: number, key: string) => {
  const move = KEYS[key];
  return move ? clampZoom(move(zoom)) : null;
};

export const manualZoomFor = (manual: ManualZoom, shot: PreviewShot) =>
  manual !== null && manual.shot === shot ? manual.zoom : null;
