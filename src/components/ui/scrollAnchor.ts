import { createContext, useContext } from "react";

/**
 * Provided by a scrolling page: scrolls it by `dy` without animation, so a
 * control that moves when content above it shrinks can stay under the finger.
 */
export const ScrollByContext = createContext<(dy: number) => void>(() => {});

export const useScrollBy = () => useContext(ScrollByContext);
