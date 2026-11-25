import { createContext, useContext } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bottomLift } from "@/lib/footerClearance";

export const TabBarShownContext = createContext(false);

export const useBottomLift = () => {
  const safeAreaBottom = useSafeAreaInsets().bottom;
  return bottomLift(useContext(TabBarShownContext), safeAreaBottom);
};
