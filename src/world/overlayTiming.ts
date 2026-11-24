export const LEAD_MS = 40;
export const ITEM_MS = 240;
export const STAGGER_MS = 40;
export const STAGGERED = 8;
const CLOSE_SPEED = 1.8;
const CALM_IN_MS = 160;
const CALM_OUT_MS = 130;

export const openLength = (items: number) => LEAD_MS + STAGGER_MS * Math.min(Math.max(items - 1, 0), STAGGERED) + ITEM_MS;

export const overlayTiming = (open: boolean, items: number, calm: boolean) => {
  if (calm) return { toValue: open ? ITEM_MS : 0, duration: open ? CALM_IN_MS : CALM_OUT_MS };
  const full = openLength(items);
  return { toValue: open ? full : 0, duration: open ? full : Math.round(full / CLOSE_SPEED) };
};

const PRESENCE_IN_MS = 260;

export const presenceTiming = (open: boolean, calm: boolean) =>
  calm ? { toValue: open ? 1 : 0, duration: open ? CALM_IN_MS : CALM_OUT_MS } : { toValue: open ? 1 : 0, duration: open ? PRESENCE_IN_MS : Math.round(PRESENCE_IN_MS / CLOSE_SPEED) };
