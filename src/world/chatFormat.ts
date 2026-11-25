import { styledName, type NameStyle } from "../../shared/names";
import { isPlace, PLACE_TITLES } from "../../shared/world";
import { clock, lineText } from "./view";

export const placeTag = (place: string | undefined) => (place && isPlace(place) ? PLACE_TITLES[place].replace(/^The /, "") : "Elsewhere");

type Line = { at: number; name: string; text: string; here: boolean; place?: string; kind?: "join" | "leave" };

export const chatLineParts = (line: Line, { times, names, pending = false }: { times: boolean; names: NameStyle; pending?: boolean }) => ({
  time: times ? (pending ? "…" : clock(line.at)) : null,
  place: line.here ? null : placeTag(line.place),
  name: styledName(line.name, names),
  text: lineText(line),
});
