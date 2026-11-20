import { Alert, Platform } from "react-native";

/** A one-button message that shows on every platform. Alert.alert does nothing on web. */
export const notify = (title: string, message: string) => {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-restricted-syntax -- this helper is the one place web dialogs are allowed
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  // eslint-disable-next-line no-restricted-syntax -- this helper is the one place Alert.alert is allowed
  Alert.alert(title, message);
};
