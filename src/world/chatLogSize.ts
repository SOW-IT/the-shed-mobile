/**
 * How big the World's chat log is for the screen it's on. A phone like the
 * iPhone 17 Pro (402 × 874) or smaller gets the base sizes; bigger screens
 * (large phones, iPads, web windows) get more lines, a wider log and
 * slightly bigger type, growing with the screen's area. The log stays
 * narrower than the screen so the World behind it stays playable.
 */

const BASE_AREA = 402 * 874;
const MOST_SCALE = 2;
const BASE_WIDTH = 460;
const MOST_WIDTH_SCALE = 1.4;
const MOST_TEXT_SCALE = 1.25;
/** In the World and the backyard. */
const WORLD_LINES = 7;
/** At the mahjong table, a bit shorter than in the World: three lines on a phone. */
const TABLE_LINES = 3;
const TABLE_TALL_FROM = 760;
const TABLE_EXTRA_LINE = 120;
const TABLE_MOST_EXTRA = 3;
const MOST_TABLE_TEXT_SCALE = 1.15;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const scaleFor = (width: number, height: number) => clamp(Math.sqrt((width * height) / BASE_AREA), 1, MOST_SCALE);

export const worldChatLog = (width: number, height: number) => {
  const scale = scaleFor(width, height);
  return {
    lines: Math.round(WORLD_LINES + (scale - 1) * 5),
    maxWidth: Math.round(BASE_WIDTH * Math.min(scale, MOST_WIDTH_SCALE)),
    text: Math.min(scale, MOST_TEXT_SCALE),
  };
};

/**
 * While the mahjong lobby is open it sits under the chat log, so the log
 * gives up lines on a short screen to leave the lobby room: 3 on an iPhone
 * SE, 5 on a phone like the iPhone 17 Pro, up to the World's own on a tall
 * window.
 */
export const lobbyChatLines = (width: number, height: number) => clamp(Math.floor((height - 670) / 40), 3, worldChatLog(width, height).lines);

/**
 * At the table the log takes height from the board, and on a short window
 * the board needs all it has, so it only gains lines where the window is
 * tall; its type grows a little with the screen, like the World's.
 */
export const tableChatLog = (width: number, height: number) => ({
  lines: TABLE_LINES + clamp(Math.floor((height - TABLE_TALL_FROM) / TABLE_EXTRA_LINE), 0, TABLE_MOST_EXTRA),
  text: Math.min(scaleFor(width, height), MOST_TABLE_TEXT_SCALE),
});
