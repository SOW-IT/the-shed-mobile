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
