import { isPlace, PLACE_TITLES } from "../../shared/world";
import { clock, lineText } from "./view";

type ChatNameStyle = "initials" | "first";

const FIRST_NAME_MOST = 14;

export const chatName = (name: string, style: ChatNameStyle): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return style === "initials" ? "?" : "Someone";
  if (style === "first") {
    const first = Array.from(words[0]);
    return first.length > FIRST_NAME_MOST ? `${first.slice(0, FIRST_NAME_MOST - 1).join("")}…` : words[0];
  }
  const ends = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return ends.map((word) => Array.from(word)[0].toUpperCase()).join("");
};

export const placeTag = (place: string | undefined) => (place && isPlace(place) ? PLACE_TITLES[place].replace(/^The /, "") : "Elsewhere");

type Line = { at: number; name: string; text: string; here: boolean; place?: string; kind?: "join" | "leave" };

export const chatLineParts = (line: Line, { times, names, pending = false }: { times: boolean; names: ChatNameStyle; pending?: boolean }) => ({
  time: times ? (pending ? "…" : clock(line.at)) : null,
  place: line.here ? null : placeTag(line.place),
  name: chatName(line.name, names),
  text: lineText(line),
});
