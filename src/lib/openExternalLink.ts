import * as WebBrowser from "expo-web-browser";
import { Linking, Platform } from "react-native";
import { browserFallbackFor, linkFailureText, type LinkFailure } from "./externalLinks";
import { notify } from "./notify";

const succeeds = async (attempt: () => Promise<unknown>): Promise<boolean> => {
  try {
    await attempt();
    return true;
  } catch {
    return false;
  }
};

export const openExternalLink = async (
  url: string,
  options: { fallbackUrl?: string; failure?: LinkFailure } = {}
): Promise<boolean> => {
  // eslint-disable-next-line no-restricted-syntax -- this helper is the one place Linking.openURL is allowed
  if (await succeeds(() => Linking.openURL(url))) return true;
  const fallback = Platform.OS === "web" ? null : browserFallbackFor(url, options.fallbackUrl);
  if (fallback && (await succeeds(() => WebBrowser.openBrowserAsync(fallback)))) return true;
  const { title, message } = options.failure ?? linkFailureText(url);
  notify(title, message);
  return false;
};
