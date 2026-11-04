const UNKNOWN_MODULE = /^Requiring unknown module "/;
const CHUNK_LOAD_FAILED = /^Loading module \S+ failed\./;
const CHUNK_INCOMPLETE = /did not finish registering its modules/;
const HTML_AS_SCRIPT = /Unexpected token '<'|Unexpected token <|expected expression, got '<'/;
const CHUNK_PATH = "/_expo/static/js/";

const NETWORK_MESSAGES = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "Network request failed",
  "A network error occurred.",
  "The network connection was lost.",
  "The Internet connection appears to be offline.",
  "The request timed out.",
  "Could not connect to the server.",
  "fetch failed",
]);

export const NETWORK_ERROR_TEXT =
  "Couldn't connect to The SHED. Check your internet connection and try again.";
export const RELOAD_NEEDED_TEXT =
  "This part of The SHED couldn't load. Check your connection, then reload the page.";

const messageOf = (error: unknown): string | null => {
  if (typeof error === "string") return error;
  if (typeof error !== "object" || error === null) return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
};

const nameOf = (error: unknown): string | null => {
  if (typeof error !== "object" || error === null) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
};

export const isUnknownModuleError = (error: unknown): boolean =>
  UNKNOWN_MODULE.test(messageOf(error) ?? "");

export const isChunkLoadError = (error: unknown): boolean => {
  if (nameOf(error) === "AsyncRequireError") return true;
  const message = messageOf(error) ?? "";
  return CHUNK_LOAD_FAILED.test(message) || CHUNK_INCOMPLETE.test(message);
};

export const isStaleReleaseError = (error: unknown): boolean =>
  isChunkLoadError(error) || isUnknownModuleError(error);

export type ScriptErrorEvent = {
  message?: string;
  filename?: string;
  error?: unknown;
};

export const isStaleScriptError = (event: ScriptErrorEvent): boolean => {
  if (!event.filename?.includes(CHUNK_PATH)) return false;
  const message = `${event.message ?? ""}\n${messageOf(event.error) ?? ""}`;
  return HTML_AS_SCRIPT.test(message);
};

export const isNetworkError = (error: unknown): boolean => {
  const message = messageOf(error)?.trim();
  if (!message) return false;
  const bare = message.replace(/^fetch failed: /, "").replace(/ \([^)]*\)$/, "");
  return NETWORK_MESSAGES.has(bare);
};

export const friendlyErrorText = (error: unknown): string | null => {
  if (isNetworkError(error)) return NETWORK_ERROR_TEXT;
  if (isStaleReleaseError(error)) return RELOAD_NEEDED_TEXT;
  return null;
};
