import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

export const watchKeyboardInset = (onInset: (inset: number) => void) => {
  if (Platform.OS !== "android") return () => undefined;
  const show = Keyboard.addListener("keyboardDidShow", (e) => onInset(e.endCoordinates.height));
  const hide = Keyboard.addListener("keyboardDidHide", () => onInset(0));
  return () => {
    show.remove();
    hide.remove();
  };
};

export const useKeyboardInset = () => {
  const [inset, setInset] = useState(0);
  useEffect(() => watchKeyboardInset(setInset), []);
  return inset;
};
