import { churchAcronym } from "../../shared/churches";
import type { Church } from "./ChurchPicker";

export type ChurchPin = { church: Church; people: number; colour: string | null };

export const PIN_NAME_MAX_WIDTH = 180;

export const pinLabel = (pin: ChurchPin, selected: boolean) =>
  selected ? pin.church.name : churchAcronym(pin.church.name);

export const pinZIndex = (pin: ChurchPin, selected: boolean) => (selected ? 100000 : 1 + pin.people);

export const pinRing = (pin: ChurchPin, accent: string) => pin.colour ?? accent;

const SIZES = { fontSize: [11, 17], height: [22, 34], paddingHorizontal: [8, 14] } as const;

/**
 * How big a pin's label is, by how many people go there: the church most
 * people go to is the biggest, one nobody goes to the smallest. Size follows
 * the square root of the share, so a few people still read as a few.
 */
export const pinSize = (people: number, most: number) => {
  const share = most > 0 ? Math.sqrt(Math.min(Math.max(people, 0), most) / most) : 0;
  const at = ([small, big]: readonly [number, number]) => Math.round((small + (big - small) * share) * 2) / 2;
  return { fontSize: at(SIZES.fontSize), height: at(SIZES.height), paddingHorizontal: at(SIZES.paddingHorizontal) };
};

export const pinAccessibilityLabel = (pin: ChurchPin) =>
  `${pin.church.name}, ${pin.people} ${pin.people === 1 ? "person" : "people"}. Show who goes there`;
