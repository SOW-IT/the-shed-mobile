import { createContext, useContext } from "react";
import type { Reach } from "@/lib/games/playArea";

const NONE: Reach = { left: 0, top: 0, right: 0, bottom: 0 };

export const BoardReach = createContext<Reach>(NONE);

export const useBoardReach = () => useContext(BoardReach);
