import { createContext, useContext } from "react";

export const RevealFocusedInputContext = createContext<() => void>(() => {});

export const useRevealFocusedInput = () => useContext(RevealFocusedInputContext);
