import { Alert, Platform } from "react-native";

// react-native-web's Alert.alert does nothing, so on web these use the
// browser's own dialogs instead.

/** Tell the user something, with an OK button. */
export const showNotice = (title: string, message?: string) => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
};

/** Ask before doing something; `onConfirm` runs only if the user agrees. */
export const confirmAction = ({
  title,
  message,
  confirmText,
  destructive = false,
  onConfirm,
}: {
  title: string;
  message?: string;
  confirmText: string;
  destructive?: boolean;
  onConfirm: () => void;
}) => {
  if (Platform.OS === "web") {
    if (
      typeof window !== "undefined" &&
      window.confirm(message ? `${title}\n\n${message}` : title)
    ) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: confirmText,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
};
