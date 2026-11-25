import { useAppTheme } from "@/theme";
import { cafeThemes } from "./palette";

export const useCafeTheme = () => cafeThemes[useAppTheme().dark ? "dark" : "light"];
