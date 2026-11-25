import { useCallback, useSyncExternalStore } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { readStored, removeStored, storedValue, tryWriteStored } from "../lib/deviceStorage";
import { NAME_STYLES, NAMES_SETTING_KEY, styledName, type NameStyle } from "../../shared/names";

const choice = <T extends string>(key: string, values: readonly T[], initial: T, save?: (key: string, value: string) => Promise<unknown>) => {
  const store = storedValue<T>({
    key,
    initial,
    restore: (saved) => (values.includes(saved as T) ? (saved as T) : null),
    serialize: (value) => value,
    save,
  });
  return { ...store, values, initial };
};

const OLD_NAME_KEYS = { players: "worldCardNames", chat: "worldChatNames" };

const namesFromOld = (players: string | null, chat: string | null): NameStyle | null => {
  if (NAME_STYLES.includes(players as NameStyle)) return players as NameStyle;
  if (chat === "initials") return "initials";
  if (chat === "first") return "short";
  return null;
};

const NAMES_KEY = NAMES_SETTING_KEY;

const namesChoice = () => {
  let saving = Promise.resolve(true);
  const save = (key: string, value: string) => (saving = saving.then(() => tryWriteStored(key, value)));
  const store = choice(NAMES_KEY, NAME_STYLES, "short", save);
  let checked = false;
  let picked = false;
  const set = (next: NameStyle) => {
    picked = true;
    store.set(next);
  };
  const carryOver = async () => {
    const [current, players, chat] = await Promise.all([readStored(NAMES_KEY), readStored(OLD_NAME_KEYS.players), readStored(OLD_NAME_KEYS.chat)]);
    const old = current === null && !picked ? namesFromOld(players, chat) : null;
    if (old) store.set(old);
    const saved = await saving;
    if (saved && (players !== null || chat !== null)) await Promise.all([removeStored(OLD_NAME_KEYS.players), removeStored(OLD_NAME_KEYS.chat)]);
  };
  const subscribe = (listener: () => void) => {
    if (!checked) {
      checked = true;
      void carryOver();
    }
    return store.subscribe(listener);
  };
  return { ...store, set, subscribe };
};

export const WORLD_SETTINGS = {
  chatTimes: choice("worldChatTimes", ["off", "on"] as const, "off"),
  pingMs: choice("worldPingMs", ["off", "on"] as const, "off"),
  motion: choice("worldMotion", ["auto", "full", "saver"] as const, "auto"),
  nameTags: choice("worldNameTags", ["all", "near"] as const, "all"),
  names: namesChoice(),
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

export const useWorldName = () => {
  const [style] = useWorldSetting("names");
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
