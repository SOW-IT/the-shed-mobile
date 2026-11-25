/**
 * How someone's name shows in the World and the games: their first name and
 * the initial of their last ("Daniel Kim" is "Daniel K."). A one-word name
 * shows as it is. A very long first name is cut to 14 characters, by code
 * point so an emoji is never cut in half, and a blank name is "Someone".
 */
export const shortName = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(words[0] ?? "");
  const short = first.length > 14 ? `${first.slice(0, 13).join("")}…` : first.join("") || "Someone";
  const initial = words.length > 1 ? Array.from(words[words.length - 1])[0].toUpperCase() : null;
  return initial ? `${short} ${initial}.` : short;
};

const wordsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean);

export const initials = (name: string): string => {
  const words = wordsOf(name);
  if (words.length === 0) return "?";
  const ends = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
  return ends.map((word) => Array.from(word)[0].toUpperCase()).join("");
};

export const fullName = (name: string): string => wordsOf(name).join(" ") || "Someone";

export const NAME_STYLES = ["initials", "short", "full"] as const;

export type NameStyle = (typeof NAME_STYLES)[number];

/** Where the World's Names setting is kept on the device; the Games list reads it too. */
export const NAMES_SETTING_KEY = "worldNames";

export const styledName = (name: string, style: NameStyle): string =>
  style === "initials" ? initials(name) : style === "full" ? fullName(name) : shortName(name);

const EMAIL_LOCAL_PART = /^[a-z]+(?:[._][a-z]+)+$/;

const capitalised = (word: string) => word[0].toUpperCase() + word.slice(1);

export const accountName = (name: string | null | undefined, email: string): string => {
  const given = name?.trim();
  const raw = given && !given.includes("@") ? given : email.split("@")[0];
  return EMAIL_LOCAL_PART.test(raw) ? raw.split(/[._]/).map(capitalised).join(" ") : raw;
};
