import { type RefObject, useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

export const keyboardOverlap = (frame: { y: number; height: number }, keyboardTop: number, alreadyGiven = 0) =>
  Math.max(0, Math.round(frame.y + frame.height + alreadyGiven - keyboardTop));

export const watchKeyboardTop = (onTop: (keyboardTop: number | null) => void) => {
  if (Platform.OS !== "android") return () => undefined;
  const show = Keyboard.addListener("keyboardDidShow", (e) => onTop(e.endCoordinates.screenY));
  const hide = Keyboard.addListener("keyboardDidHide", () => onTop(null));
  const open = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
  if (open) onTop(open.screenY);
  return () => {
    show.remove();
    hide.remove();
  };
};

export const useKeyboardInset = (frame: RefObject<Measurable | null>, frameShrinks = true) => {
  const [inset, setInset] = useState(0);
  const given = useRef(0);
  useEffect(
    () =>
      watchKeyboardTop((keyboardTop) => {
        const give = (next: number) => {
          given.current = next;
          setInset(next);
        };
        if (keyboardTop === null) return give(0);
        frame.current?.measureInWindow((_x, y, _width, height) =>
          give(keyboardOverlap({ y, height }, keyboardTop, frameShrinks ? given.current : 0))
        );
      }),
    [frame, frameShrinks]
  );
  return inset;
};
