import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { LocalDevotionalDraft } from "../../shared/devotionals";
import {
  createDevotionalStore,
  EMPTY_DEVOTIONAL_MAP,
  EMPTY_DIRTY_DEVOTIONALS,
  type DevotionalStorageBackend,
} from "../../shared/devotionalStore";

const safeFilename = (key: string) =>
  `devotionals-${key.replace(/[^a-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}.json`;

const onWeb = () => Platform.OS === "web" && typeof window !== "undefined";

const defaultBackend: DevotionalStorageBackend = {
  read: async (key) => {
    if (onWeb()) return window.localStorage.getItem(key);
    const file = new File(Paths.document, safeFilename(key));
    if (!file.exists) return null;
    return await file.text();
  },
  exclusive: (key, run) => {
    const locks = onWeb() ? window.navigator.locks : undefined;
    return locks ? locks.request(key, run) : run();
  },
  write: async (key, value) => {
    try {
      if (onWeb()) {
        window.localStorage.setItem(key, value);
        return true;
      }
      const file = new File(Paths.document, safeFilename(key));
      if (!file.exists) file.create();
      await file.write(value);
      return true;
    } catch {
      return false;
    }
  },
};

const store = createDevotionalStore(defaultBackend);

if (onWeb()) {
  window.addEventListener("storage", (event) => {
    if (event.key) void store.storedElsewhere(event.key);
  });
}

export const saveLocalDevotional = store.saveLocal;
export const persistLocalDevotionals = store.persistNow;
export const markDevotionalSynced = store.markSynced;
export const markDevotionalConflict = store.markConflict;
export const keepLocalDevotional = store.keepMine;
export const takeServerDevotional = store.takeTheirs;
export const getLocalDevotional = (email: string, date: string): LocalDevotionalDraft | undefined =>
  store.getDrafts(email)[date];

export const useLocalDevotionals = (
  email: string | null | undefined
): Readonly<Record<string, LocalDevotionalDraft>> =>
  useSyncExternalStore(
    (listener) => store.subscribe(email, listener),
    () => store.getDrafts(email),
    () => EMPTY_DEVOTIONAL_MAP
  );

export const useDirtyDevotionals = (email: string | null | undefined): readonly LocalDevotionalDraft[] =>
  useSyncExternalStore(
    (listener) => store.subscribe(email, listener),
    () => store.getDirty(email),
    () => EMPTY_DIRTY_DEVOTIONALS
  );
