import { useSyncExternalStore } from "react";
import { storedValue } from "@/lib/deviceStorage";

export type CalendarView = "month" | "week";

const store = storedValue<CalendarView>({
  key: "calendarView",
  initial: "month",
  restore: (saved) => (saved === "month" || saved === "week" ? saved : null),
  serialize: (value) => value,
});

// Picking the view it's already on still counts, so a link to Month beats a saved Week.
const setView = store.set;

// Month or Week, remembered on this phone or browser.
export const useCalendarView = () => [useSyncExternalStore(store.subscribe, store.get, store.get), setView] as const;
