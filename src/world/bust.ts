import { bodyScale, lookPart, type Look } from "../../shared/world";
import { people } from "./palette";

export const BUST_BORDER = 2;

export const bustFigure = (look: Look, size: number) => {
  const s = size * 0.62;
  const up = s * 0.86;
  const inside = size - BUST_BORDER * 2;
  return { foot: { x: inside / 2, y: inside / 2 + bodyScale(look).height * up, depth: 1, scale: s }, s, up, bob: 0 };
};

export const backdropOf = (look: Look) => people.backdrops[lookPart(look, "backdrop")] ?? people.backdrops[0];
