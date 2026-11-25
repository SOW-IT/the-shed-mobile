import { isPlace, JOINED_WORLD, PLACE_TITLES } from "../../shared/world";
import { styledName, type NameStyle } from "../../shared/names";

// Which way the world shows: the drawn garden, or a plain list of who's here
// and what they said. The list is the fallback for VoiceOver, for being
// offline, and for anyone who'd rather have it.

type WorldView = "garden" | "list";

export const pickView = ({
  offline,
  screenReader,
  canDraw = true,
}: {
  offline: boolean;
  screenReader: boolean;
  /**
   * Whether this platform draws the garden right. Android ignores the
   * perspective part of a view's matrix, so its quads come out wrong.
   */
  canDraw?: boolean;
}): WorldView => {
  if (offline || !canDraw) return "list";
  return screenReader ? "list" : "garden";
};

const SKEW_FROM_ANDROID_API = 29;

export const canDrawOn = (os: string, version: string | number) => os !== "android" || Number(version) >= SKEW_FROM_ANDROID_API;

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
