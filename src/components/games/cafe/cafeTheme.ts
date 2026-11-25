import { fixedColours, useAppTheme } from "@/theme";

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type CafeTheme = Widen<typeof fixedColours.games.cafe.light>;

export const useCafeTheme = (): CafeTheme => fixedColours.games.cafe[useAppTheme().dark ? "dark" : "light"];
