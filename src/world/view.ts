import { isPlace, JOINED_WORLD, PLACE_TITLES } from "../../shared/world";
import { styledName, type NameStyle } from "../../shared/names";

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const lineWhere = (line: { here: boolean; place?: string }) =>
  line.here ? null : line.place && isPlace(line.place) ? PLACE_TITLES[line.place] : "elsewhere";

type LogLine = { isMe: boolean; name: string; text: string; here: boolean; place?: string; kind?: "join" | "leave" };

export const lineText = (line: Pick<LogLine, "text" | "kind">) => (line.kind === "join" && line.text.startsWith("joined ") ? JOINED_WORLD : line.text);

export const systemLine = (line: Pick<LogLine, "name" | "text" | "kind">, style: NameStyle = "short") => `${styledName(line.name, style)} ${lineText(line)}`;

export const saidLabel = (line: LogLine, style: NameStyle = "short") => {
  const where = lineWhere(line);
  if (line.kind) {
    if (line.kind === "join" || !where) return systemLine(line, style);
    return `${systemLine(line, style)}${where === "elsewhere" ? ", elsewhere" : ` ${where}`}`;
  }
  return `${line.isMe ? "You" : styledName(line.name, style)} said ${line.text}${where ? `, ${where === "elsewhere" ? "elsewhere" : `in ${where}`}` : ""}`;
};
