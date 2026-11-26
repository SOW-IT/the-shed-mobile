export const STATUS_CARD_MS = 3000;
const CARD_RISE = 78;

export const cardTopFor = (anchorY: number, minTop: number) => Math.max(anchorY - CARD_RISE, minTop);
