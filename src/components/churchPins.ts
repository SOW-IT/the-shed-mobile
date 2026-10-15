import { churchAcronym } from "../../shared/churches";
import { contrastingText } from "../../shared/rollcall";
import type { Church } from "./ChurchPicker";

export type ChurchPin = { church: Church; people: number; colour: string | null };

export const PIN_NAME_MAX_WIDTH = 180;

export const pinLabel = (pin: ChurchPin, selected: boolean) =>
  selected ? pin.church.name : churchAcronym(pin.church.name);

export const pinZIndex = (pin: ChurchPin, selected: boolean) => (selected ? 100000 : 1 + pin.people);

export const pinColours = (pin: ChurchPin, accent: string) => {
  const ring = pin.colour ?? accent;
  return { ring, badgeText: contrastingText(ring) };
};

export const pinAccessibilityLabel = (pin: ChurchPin) =>
  `${pin.church.name}, ${pin.people} ${pin.people === 1 ? "person" : "people"}. Show who goes there`;
