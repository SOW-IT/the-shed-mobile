// The custom colour picker's maths: hue, strength and lightness (HSL, each 0
// to 1) to and from 0xRRGGBB, and the hex someone types.

export type Hsl = { h: number; s: number; l: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const hslToRgb = ({ h, s, l }: Hsl): number => {
  const sat = clamp01(s);
  const light = clamp01(l);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hue = (((h % 1) + 1) % 1) * 6;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const [r, g, b] =
    hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x];
  const m = light - c / 2;
  const byte = (v: number) => Math.round((v + m) * 255);
  return (byte(r) << 16) | (byte(g) << 8) | byte(b);
};

export const rgbToHsl = (rgb: number): Hsl => {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s: clamp01(s), l };
};

/** A typed hex colour ("#3a64b8", "3A64B8" or "#36b") as 0xRRGGBB, or null. */
export const parseHex = (text: string): number | null => {
  const raw = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) return parseInt(raw.replace(/(.)/g, "$1$1"), 16);
  if (/^[0-9a-f]{6}$/i.test(raw)) return parseInt(raw, 16);
  return null;
};

/** The colour at `t` (0 to 1) along each slider, the rest of the colour held. */
export const sliderColour = (slider: "h" | "s" | "l", hsl: Hsl, t: number): number => {
  if (slider === "h") return hslToRgb({ h: t, s: Math.max(hsl.s, 0.55), l: 0.55 });
  return hslToRgb({ ...hsl, [slider]: t });
};
