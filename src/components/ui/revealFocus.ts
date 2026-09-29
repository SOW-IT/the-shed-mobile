import { createContext, useContext } from "react";

/**
 * Provided by a scrolling Sheet: brings the focused field fully into view.
 * Fields call it on focus, since moving between fields with the keyboard
 * already up fires no keyboard event to react to.
 */
export const RevealFocusedInputContext = createContext<() => void>(() => {});

export const useRevealFocusedInput = () => useContext(RevealFocusedInputContext);
