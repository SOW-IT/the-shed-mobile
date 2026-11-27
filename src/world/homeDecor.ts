import type { Placed } from "@shared/home";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../convex/_generated/api";

/** The key of a piece you've taken from the tray but not yet put down. Nothing is saved until you do. */
export const DRAFT_KEY = "draft";

/** A piece put down but not yet saved goes by this key until the server gives it one. */
export const PENDING_PREFIX = "pending-";
export const isPending = (key: string | null) => key !== null && key.startsWith(PENDING_PREFIX);

/** Changes the furniture in every home the store holds (there's only ever yours open). */
const patchItems = (store: OptimisticLocalStore, change: (items: readonly Placed[]) => Placed[]) => {
  for (const { args, value } of store.getAllQueries(api.worldHome.home)) {
    if (value?.mine) store.setQuery(api.worldHome.home, args, { ...value, items: change(value.items) });
  }
};

export const showMove = (store: OptimisticLocalStore, { key, x, z, turn }: { key: string; x: number; z: number; turn: number }) =>
  patchItems(store, (items) => items.map((p) => (p.key === key ? { ...p, x, z, turn } : p)));

/** A pending copy of the piece, at the spot asked for (the server may nudge it to fit). */
export const showPlace = (pendingKey: string) => (store: OptimisticLocalStore, { item, x, z, turn }: { item: string; x: number; z: number; turn: number }) =>
  patchItems(store, (items) => [...items, { key: pendingKey, item, x, z, turn }]);

export const showRemove = (store: OptimisticLocalStore, { key }: { key: string }) => patchItems(store, (items) => items.filter((p) => p.key !== key));
