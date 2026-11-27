import type { PreviewShot } from "./previewMotion";

type ZoomFrame = { s: number; y: number; focus?: number };
type ZoomLimits = { low: number; high: number };
export type ManualZoom = { shot: PreviewShot; zoom: number } | null;

const KEY_STEP = 0.05;
const PAGE_STEP = 0.2;
const WHEEL_PX_PER_STEP = 400;
export const ZOOM_A11Y_STEP = 0.1;

export const clampZoom = (zoom: number) => Math.max(0, Math.min(1, zoom));

const usable = (limits: ZoomLimits) => limits.low > 0 && Number.isFinite(limits.high) && limits.high > limits.low;

const span = (limits: ZoomLimits) => (usable(limits) ? Math.log(limits.high / limits.low) : 0);

export const zoomLimits = (full: ZoomFrame, tab: ZoomFrame, closest: number): ZoomLimits => {
  const low = Math.min(full.s, tab.s);
  return { low, high: Math.max(low, closest, tab.s) };
};

export const zoomOf = (s: number, limits: ZoomLimits) => {
  const range = span(limits);
  return range > 0 && s > 0 ? clampZoom(Math.log(s / limits.low) / range) : 0;
};

const scaleOf = (zoom: number, limits: ZoomLimits) => limits.low * Math.exp(clampZoom(zoom) * span(limits));

export const zoomFrame = (
  { full, tab, height, limits }: { full: ZoomFrame; tab: ZoomFrame; height: number; limits: ZoomLimits },
  zoom: number | null
): ZoomFrame => {
  if (zoom === null || !usable(limits) || !(tab.s > 0) || !(full.s > 0)) return tab;
  const s = scaleOf(zoom, limits);
  const middle = height / 2;
  const tabFocus = tab.focus ?? (tab.y - middle) / tab.s;
  const tabFocusAt = tab.y - tabFocus * tab.s;
  const fullFocus = (full.y - middle) / full.s;
  const widerThanTab = Math.log(tab.s / limits.low);
  const towardTab = s >= tab.s || widerThanTab <= 0 ? 1 : Math.log(s / limits.low) / widerThanTab;
  const focus = fullFocus + (tabFocus - fullFocus) * towardTab;
  const focusAt = middle + (tabFocusAt - middle) * towardTab;
  return { s, y: focusAt + focus * s };
};

export const pinchZoom = (start: number, ratio: number, limits: ZoomLimits) => {
  const range = span(limits);
  if (!(ratio > 0) || range === 0) return clampZoom(start);
  return clampZoom(start + Math.log(ratio) / range);
};

export const wheelZoom = (zoom: number, deltaY: number, limits: ZoomLimits) => {
  const range = span(limits);
  if (!Number.isFinite(deltaY) || range === 0) return clampZoom(zoom);
  return clampZoom(zoom - deltaY / (WHEEL_PX_PER_STEP * range));
};

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

export const PINCH_GRACE_MS = 200;

export type PinchState = { pinched: boolean; base: { spread: number; zoom: number } | null };

export const PINCH_IDLE: PinchState = { pinched: false, base: null };

export const pinchMove = (
  state: PinchState,
  { fingers, spread, zoom, limits }: { fingers: number; spread: number; zoom: number; limits: ZoomLimits }
): { state: PinchState; zoom: number | null; began: boolean } => {
  if (fingers < 2) return { state: { pinched: state.pinched, base: null }, zoom: null, began: false };
  if (state.base === null) {
    if (!(spread > 0)) return { state, zoom: null, began: false };
    return { state: { pinched: true, base: { spread, zoom } }, zoom: null, began: !state.pinched };
  }
  return { state, zoom: pinchZoom(state.base.zoom, spread / state.base.spread, limits), began: false };
};

export const pinchLift = (state: PinchState, fingers: number): PinchState =>
  fingers < 2 ? { pinched: state.pinched, base: null } : state;
