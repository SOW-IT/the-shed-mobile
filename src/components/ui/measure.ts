import { Platform } from "react-native";

export type Measurable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
  getBoundingClientRect?: () => { top: number };
};

export const measureY = (node: Measurable, callback: (y: number | null) => void) => {
  if (Platform.OS === "web") {
    const rect = node.getBoundingClientRect?.();
    callback(rect ? rect.top : null);
  } else if (node.measureInWindow) {
    node.measureInWindow((_x, y) => callback(y));
  } else {
    callback(null);
  }
};
