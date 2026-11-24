import { useSyncExternalStore } from "react";
import { storedValue } from "../lib/deviceStorage";

export const pingMsStore = storedValue<boolean>({
  key: "worldPingMs",
  initial: false,
  restore: (saved) => (saved === "on" ? true : saved === "off" ? false : null),
  serialize: (on) => (on ? "on" : "off"),
});

export const useShowPingMs = () => [useSyncExternalStore(pingMsStore.subscribe, pingMsStore.get, pingMsStore.get), pingMsStore.set] as const;
