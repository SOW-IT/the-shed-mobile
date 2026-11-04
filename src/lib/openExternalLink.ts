import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, Platform } from "react-native";
import { browserFallbackFor, linkFailureText, type LinkFailure } from "./externalLinks";

const succeeds = async (attempt: () => Promise<unknown>): Promise<boolean> => {
  try {
    await attempt();
    return true;
  } catch {
    return false;
  }
};

const showFailure = ({ title, message }: LinkFailure) => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};

export const openExternalLink = async (
  url: string,
  options: { fallbackUrl?: string; failure?: LinkFailure } = {}
): Promise<boolean> => {
  if (await succeeds(() => Linking.openURL(url))) return true;
  const fallback = Platform.OS === "web" ? null : browserFallbackFor(url, options.fallbackUrl);
  if (fallback && (await succeeds(() => WebBrowser.openBrowserAsync(fallback)))) return true;
  showFailure(options.failure ?? linkFailureText(url));
  return false;
};
