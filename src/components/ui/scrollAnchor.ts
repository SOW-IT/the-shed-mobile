import { createContext, useContext } from "react";

export const ScrollByContext = createContext<(dy: number) => void>(() => {});

export const useScrollBy = () => useContext(ScrollByContext);
