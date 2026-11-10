import { useCallback, useEffect, useSyncExternalStore } from "react";
import { storedValue } from "@/lib/deviceStorage";
import type { NavGroupKey } from "@/lib/navMenu";

type OpenGroups = Partial<Record<NavGroupKey, boolean>>;

const store = storedValue<OpenGroups>({
  key: "navGroupsOpen",
  initial: {},
  restore: (saved, current) => {
    try {
      return { ...JSON.parse(saved), ...current };
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

const setGroupOpen = (key: NavGroupKey, open: boolean) => {
  if (store.get()[key] === open) return;
  store.set({ ...store.get(), [key]: open });
};

export const useNavGroupOpen = (key: NavGroupKey, containsActive: boolean) => {
  const isOpen = useCallback(() => store.get()[key] ?? false, [key]);
  const open = useSyncExternalStore(store.subscribe, isOpen, isOpen);
  useEffect(() => {
    if (containsActive) setGroupOpen(key, true);
  }, [containsActive, key]);
  const toggle = useCallback(() => setGroupOpen(key, !(store.get()[key] ?? false)), [key]);
  return [open, toggle] as const;
};
