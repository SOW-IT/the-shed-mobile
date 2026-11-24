const MS_PER_CHAR = 60;
const SHORTEST_MS = 600;
const LONGEST_MS = 4000;
const FLAP_MS = 130;

export const talkMs = (text: string) => Math.min(LONGEST_MS, Math.max(SHORTEST_MS, Array.from(text).length * MS_PER_CHAR));

export const mouthAt = (say: { text: string; at: number } | undefined, now: number): boolean | undefined => {
  if (!say) return undefined;
  const age = now - say.at;
  if (age < 0 || age >= talkMs(say.text)) return undefined;
  return Math.floor(age / FLAP_MS) % 2 === 0;
};
