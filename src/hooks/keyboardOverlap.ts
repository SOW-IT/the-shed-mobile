export const keyboardOverlap = (frameBottom: number, windowHeight: number, keyboardHeight: number) => {
  "worklet";
  return keyboardHeight <= 0 ? 0 : Math.max(0, Math.round(frameBottom - (windowHeight - keyboardHeight)));
};

export const liftOverKeyboard = (keyboardHeight: number, bottomInset: number, gap: number) => {
  "worklet";
  return Math.max(0, keyboardHeight - bottomInset + Math.min(gap, keyboardHeight));
};

export const sheetKeyboardPadding = (keyboardHeight: number, offset: number) => {
  "worklet";
  return Math.max(0, keyboardHeight) + Math.min(Math.max(0, keyboardHeight), offset);
};
