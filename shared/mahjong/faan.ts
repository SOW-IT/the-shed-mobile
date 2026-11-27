import { isThirteenOrphans, readings, type Group } from "./hand";
import { isDragon, isHonour, isSuited, isTerminal, isTerminalOrHonour, isWind, suitOf, windKind } from "./tiles";

/**
 * Hong Kong faan (番). Each entry is one line on the round's breakdown. A
 * limit hand (例牌) is worth the table's cap however it adds up.
 */
export const FAAN = {
  selfDrawn: { zh: "自摸", en: "Self-drawn", faan: 1 },
  concealed: { zh: "門前清", en: "Concealed hand", faan: 1 },
  allChows: { zh: "平糊", en: "All chows", faan: 1 },
  allPongs: { zh: "對對糊", en: "All pongs", faan: 3 },
  mixedSuit: { zh: "混一色", en: "Mixed one suit", faan: 3 },
  pureSuit: { zh: "清一色", en: "Pure one suit", faan: 7 },
  dragonPong: { zh: "箭刻", en: "Dragon pong", faan: 1 },
  seatWind: { zh: "門風", en: "Seat wind pong", faan: 1 },
  roundWind: { zh: "圈風", en: "Round wind pong", faan: 1 },
  smallDragons: { zh: "小三元", en: "Small three dragons", faan: 5 },
  greatDragons: { zh: "大三元", en: "Great three dragons", faan: 8 },
  smallWinds: { zh: "小四喜", en: "Small four winds", faan: 6 },
  mixedTerminals: { zh: "混么九", en: "Mixed terminals", faan: 1 },
  kongWin: { zh: "槓上開花", en: "Win on a kong tile", faan: 2 },
  lastTile: { zh: "海底撈月", en: "Win on the last tile", faan: 1 },
  robbedKong: { zh: "搶槓", en: "Robbing the kong", faan: 1 },
  concealedPongs: { zh: "坎坎胡", en: "Four concealed pongs", faan: 8 },
  greatWinds: { zh: "大四喜", en: "Great four winds", faan: 13, limit: true },
  allHonours: { zh: "字一色", en: "All honours", faan: 10, limit: true },
  pureTerminals: { zh: "清么九", en: "Pure terminals", faan: 10, limit: true },
  thirteenOrphans: { zh: "十三么", en: "Thirteen orphans", faan: 13, limit: true },
  nineGates: { zh: "九子連環", en: "Nine gates", faan: 10, limit: true },
  fourKongs: { zh: "十八羅漢", en: "Four kongs", faan: 13, limit: true },
  heavenly: { zh: "天糊", en: "Heavenly hand", faan: 13, limit: true },
  earthly: { zh: "地糊", en: "Earthly hand", faan: 13, limit: true },
} as const;
export type FaanId = keyof typeof FAAN;
export type FaanLine = { id: FaanId; faan: number };

/** A meld laid down: chows start at `kind`. A concealed kong isn't "open". */
export type MeldShape = { type: "chow" | "pong" | "kong"; kind: number; concealed?: boolean };

export type WinContext = {
  /** The concealed tiles' counts, the winning tile included. */
  counts: readonly number[];
  melds: readonly MeldShape[];
  winKind: number;
  selfDrawn: boolean;
  seatWind: number;
  roundWind: number;
  kongWin?: boolean;
  lastTile?: boolean;
  robbedKong?: boolean;
  heavenly?: boolean;
  earthly?: boolean;
};

export type Scored = { lines: FaanLine[]; total: number; limit: boolean };

type Set = { type: "chow" | "pong" | "kong"; kind: number; concealed: boolean };

const line = (id: FaanId, times = 1): FaanLine => ({ id, faan: FAAN[id].faan * times });

const situationLines = (ctx: WinContext, concealedHand: boolean): FaanLine[] => {
  const lines: FaanLine[] = [];
  if (ctx.selfDrawn) lines.push(line("selfDrawn"));
  if (concealedHand) lines.push(line("concealed"));
  if (ctx.kongWin) lines.push(line("kongWin"));
  if (ctx.lastTile) lines.push(line("lastTile"));
  if (ctx.robbedKong) lines.push(line("robbedKong"));
  return lines;
};

const isNineGates = (counts: readonly number[], melds: number) => {
  if (melds > 0) return false;
  const suits = new Set(counts.flatMap((n, kind) => (n > 0 ? [isSuited(kind) ? suitOf(kind) : -1] : [])));
  if (suits.size !== 1 || suits.has(-1)) return false;
  const base = [...suits][0] * 9;
  const need = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  return need.every((n, i) => counts[base + i] >= n);
};

const scoreReading = (ctx: WinContext, pair: number, sets: Set[]): Omit<Scored, "total"> => {
  const concealedHand = ctx.melds.every((m) => m.concealed === true);
  const kinds = [pair, ...sets.flatMap((s) => (s.type === "chow" ? [s.kind, s.kind + 1, s.kind + 2] : [s.kind]))];
  const suits = new Set(kinds.filter(isSuited).map(suitOf));
  const honours = kinds.some(isHonour);
  const pongs = sets.filter((s) => s.type !== "chow");
  const dragonPongs = pongs.filter((s) => isDragon(s.kind)).length;
  const windPongs = pongs.filter((s) => isWind(s.kind)).length;
  const limits: FaanLine[] = [];
  if (windPongs === 4) limits.push(line("greatWinds"));
  if (suits.size === 0) limits.push(line("allHonours"));
  if (kinds.every(isTerminal)) limits.push(line("pureTerminals"));
  if (sets.filter((s) => s.type === "kong").length === 4) limits.push(line("fourKongs"));
  if (ctx.heavenly) limits.push(line("heavenly"));
  if (ctx.earthly) limits.push(line("earthly"));
  if (isNineGates(ctx.counts, ctx.melds.length)) limits.push(line("nineGates"));
  if (limits.length > 0) return { lines: limits, limit: true };
  const lines: FaanLine[] = [];
  if (sets.every((s) => s.type === "chow")) lines.push(line("allChows"));
  const concealedPongs = pongs.length === 4 && pongs.every((s) => s.concealed);
  if (pongs.length === 4) lines.push(line(concealedPongs ? "concealedPongs" : "allPongs"));
  if (suits.size === 1) lines.push(line(honours ? "mixedSuit" : "pureSuit"));
  if (dragonPongs === 3) lines.push(line("greatDragons"));
  else if (dragonPongs === 2 && isDragon(pair)) lines.push(line("smallDragons"));
  else if (dragonPongs > 0) lines.push(line("dragonPong", dragonPongs));
  if (windPongs === 3 && isWind(pair)) lines.push(line("smallWinds"));
  else {
    if (pongs.some((s) => s.kind === windKind(ctx.seatWind))) lines.push(line("seatWind"));
    if (pongs.some((s) => s.kind === windKind(ctx.roundWind))) lines.push(line("roundWind"));
  }
  if (honours && kinds.every(isTerminalOrHonour)) lines.push(line("mixedTerminals"));
  return { lines: [...lines, ...situationLines(ctx, concealedHand && !concealedPongs)], limit: false };
};

/**
 * The best score this winning hand can be read as, before any cap, or null
 * when it isn't a winning hand at all.
 */
export const scoreWin = (ctx: WinContext): Scored | null => {
  const sum = (lines: FaanLine[]) => lines.reduce((total, l) => total + l.faan, 0);
  if (ctx.melds.length === 0 && isThirteenOrphans(ctx.counts)) {
    const lines = [line("thirteenOrphans")];
    return { lines, total: sum(lines), limit: true };
  }
  const melded: Set[] = ctx.melds.map((m) => ({ type: m.type, kind: m.kind, concealed: m.concealed === true }));
  let best: Scored | null = null;
  for (const reading of readings(ctx.counts, 4 - ctx.melds.length)) {
    // A pong completed by someone else's discard is an open pong.
    const won = reading.groups.map((g: Group): Set => ({
      type: g.type,
      kind: g.kind,
      concealed: g.type === "chow" || ctx.selfDrawn || g.kind !== ctx.winKind || reading.groups.some((o) => o !== g && o.type === "chow" && ctx.winKind >= o.kind && ctx.winKind <= o.kind + 2),
    }));
    const scored = scoreReading(ctx, reading.pair, [...melded, ...won]);
    const total = sum(scored.lines);
    if (!best || (scored.limit && !best.limit) || (scored.limit === best.limit && total > best.total)) best = { ...scored, total };
  }
  return best;
};

/** What a score is worth at the table: the cap for a limit hand, and never past the cap. */
export const cappedFaan = (scored: Scored, cap: number) => (scored.limit ? cap : Math.min(scored.total, cap));

