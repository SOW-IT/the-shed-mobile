import { useCallback, useSyncExternalStore } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { storedValue } from "../lib/deviceStorage";
import { NAME_STYLES, styledName } from "../../shared/names";

const choice = <T extends string>(key: string, values: readonly T[], initial: T) => {
  const store = storedValue<T>({
    key,
    initial,
    restore: (saved) => (values.includes(saved as T) ? (saved as T) : null),
    serialize: (value) => value,
  });
  return { ...store, values, initial };
};

export const WORLD_SETTINGS = {
  chatTimes: choice("worldChatTimes", ["off", "on"] as const, "off"),
  chatNames: choice("worldChatNames", ["initials", "first"] as const, "initials"),
  pingMs: choice("worldPingMs", ["off", "on"] as const, "off"),
  motion: choice("worldMotion", ["auto", "full", "saver"] as const, "auto"),
  nameTags: choice("worldNameTags", ["all", "near"] as const, "all"),
  cardNames: choice("worldCardNames", NAME_STYLES, "short"),
};

export type WorldSettingKey = keyof typeof WORLD_SETTINGS;
export type WorldSettingValue<K extends WorldSettingKey> = (typeof WORLD_SETTINGS)[K]["values"][number];

export const useWorldSetting = <K extends WorldSettingKey>(key: K) => {
  const store = WORLD_SETTINGS[key];
  const value = useSyncExternalStore(store.subscribe, store.get, store.get) as WorldSettingValue<K>;
  return [value, store.set as (next: WorldSettingValue<K>) => void] as const;
};

export const saverOn = (motion: WorldSettingValue<"motion">, systemReduce: boolean) =>
  motion === "saver" || (motion === "auto" && systemReduce);

export const useBatterySaver = () => {
  const [motion] = useWorldSetting("motion");
  return saverOn(motion, useReducedMotion());
};

export const useCardName = () => {
  const [style] = useWorldSetting("cardNames");
  return useCallback((name: string) => styledName(name, style), [style]);
};

const NEAR_TAG_RADIUS = 5;

export const tagShown = ({
  mode,
  me,
  distance,
  speaking,
}: {
  mode: WorldSettingValue<"nameTags">;
  me: boolean;
  distance: number | null;
  speaking: boolean;
}) => mode === "all" || me || speaking || (distance !== null && distance <= NEAR_TAG_RADIUS);
