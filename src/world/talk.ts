import { BUBBLE_MS } from "../../shared/world";

const FLAP_MS = 130;
const TALK_SHORTEST_MS = BUBBLE_MS / 4;
const TALK_FREE_CHARS = 5;
const TALK_MS_PER_CHAR = 75;
export const FACE_MIN = 0.15;

export const talkMs = (text: string) => {
  const chars = Array.from(text.trim()).length;
  if (chars === 0) return 0;
  const wanted = TALK_SHORTEST_MS + Math.max(0, chars - TALK_FREE_CHARS) * TALK_MS_PER_CHAR;
  if (wanted <= TALK_SHORTEST_MS) return TALK_SHORTEST_MS;
  const pair = FLAP_MS * 2;
  return Math.min(BUBBLE_MS, Math.ceil(wanted / pair) * pair);
};

export const bubbleAge = (say: { at: number } | undefined, now: number): number | null => {
  if (!say) return null;
  const age = now - say.at;
  return age >= 0 && age < BUBBLE_MS ? age : null;
};

export const talkAge = (say: { text: string; at: number } | undefined, now: number): number | null => {
  const age = bubbleAge(say, now);
  return say && age !== null && age < talkMs(say.text) ? age : null;
};

export const mouthAt = (talking: number | null, heading: number): boolean | undefined =>
  talking === null || Math.cos(heading) <= FACE_MIN ? undefined : Math.floor(talking / FLAP_MS) % 2 === 0;

export const nextFlapAt = (saidAt: number, talking: number) => saidAt + (Math.floor(talking / FLAP_MS) + 1) * FLAP_MS;
