import { parseDayKey } from "./calendar";
import {
  parseDraftStore,
  sameDevotionalContent,
  type DevotionalContent,
  type DevotionalEntry,
  type LocalDevotionalDraft,
} from "./devotionals";

export type DevotionalStorageBackend = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<boolean>;
  exclusive?: <T>(key: string, run: () => Promise<T>) => Promise<T>;
};

type SavedOnServer = { passage: string; deleted: boolean; updatedAt: number };

export const EMPTY_DEVOTIONAL_MAP: Readonly<Record<string, LocalDevotionalDraft>> = {};
export const EMPTY_DIRTY_DEVOTIONALS: readonly LocalDevotionalDraft[] = [];

const keyFor = (email: string) => `devotionals.drafts.${email.trim().toLowerCase()}`;

const REMOVED_KEY = "removed";

const parseRemoved = (raw: string): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(raw);
    const removed = (parsed as Record<string, unknown> | null)?.[REMOVED_KEY];
    if (!removed || typeof removed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [date, at] of Object.entries(removed as Record<string, unknown>)) {
      if (parseDayKey(date) !== null && typeof at === "number" && Number.isFinite(at)) out[date] = at;
    }
    return out;
  } catch {
    return {};
  }
};

const stampOf = (draft: LocalDevotionalDraft) => draft.savedAt ?? draft.updatedAt;

const serialize = (drafts: Record<string, LocalDevotionalDraft>, removed: Record<string, number>) => {
  const out: Record<string, unknown> = {};
  for (const date of Object.keys(drafts).sort()) {
    const d = drafts[date];
    out[date] = {
      passage: d.passage,
      notes: d.notes,
      prayerPoints: d.prayerPoints,
      updatedAt: d.updatedAt,
      dirty: d.dirty,
      base: d.base,
      conflict: d.conflict,
      savedAt: stampOf(d),
    };
  }
  out[REMOVED_KEY] = Object.fromEntries(Object.keys(removed).sort().map((date) => [date, removed[date]]));
  return JSON.stringify(out);
};

export const createDevotionalStore = (backend: DevotionalStorageBackend) => {
  type Bucket = {
    drafts: Record<string, LocalDevotionalDraft>;
    removed: Record<string, number>;
    touched: Set<string>;
    dirty: LocalDevotionalDraft[];
    loaded: boolean;
    loading: Promise<void> | null;
    listeners: Set<() => void>;
    writing: Promise<boolean>;
  };

  const buckets = new Map<string, Bucket>();

  const recomputeDirty = (bucket: Bucket) => {
    bucket.dirty = Object.values(bucket.drafts)
      .filter((d) => d.dirty)
      .sort((a, b) => a.date.localeCompare(b.date));
  };

  const notify = (bucket: Bucket) => {
    for (const listener of bucket.listeners) listener();
  };

  const getBucket = (email: string): Bucket => {
    const k = keyFor(email);
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = {
        drafts: {},
        removed: {},
        touched: new Set(),
        dirty: [],
        loaded: false,
        loading: null,
        listeners: new Set(),
        writing: Promise.resolve(true),
      };
      buckets.set(k, bucket);
    }
    return bucket;
  };

  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(Date.now(), lastStamp + 1);
    return lastStamp;
  };

  const catchUp = (raw: string | null) => {
    if (!raw) return;
    for (const at of Object.values(parseRemoved(raw))) lastStamp = Math.max(lastStamp, at);
    for (const stored of Object.values(parseDraftStore(raw))) lastStamp = Math.max(lastStamp, stampOf(stored));
  };

  const restampTouched = (bucket: Bucket) => {
    const touched = [...bucket.touched];
    bucket.touched = new Set();
    const drafts = { ...bucket.drafts };
    const removed = { ...bucket.removed };
    for (const date of touched) {
      if (drafts[date]) drafts[date] = { ...drafts[date], savedAt: stamp() };
      else if (removed[date] !== undefined) removed[date] = stamp();
    }
    bucket.drafts = drafts;
    bucket.removed = removed;
    return touched;
  };

  const mergeStored = (bucket: Bucket, raw: string | null) => {
    if (!raw) return;
    const removed = { ...bucket.removed };
    for (const [date, at] of Object.entries(parseRemoved(raw))) {
      lastStamp = Math.max(lastStamp, at);
      if ((removed[date] ?? -Infinity) < at) removed[date] = at;
    }
    const drafts = { ...bucket.drafts };
    let changed = false;
    for (const [date, stored] of Object.entries(parseDraftStore(raw))) {
      lastStamp = Math.max(lastStamp, stampOf(stored));
      const mine = drafts[date];
      if ((removed[date] ?? -Infinity) > stampOf(stored)) continue;
      if (!mine || stampOf(stored) > stampOf(mine)) {
        drafts[date] = stored;
        changed = true;
      }
    }
    for (const [date, mine] of Object.entries(drafts)) {
      if ((removed[date] ?? -Infinity) > stampOf(mine)) {
        delete drafts[date];
        changed = true;
      }
    }
    bucket.removed = removed;
    if (changed) {
      bucket.drafts = drafts;
      recomputeDirty(bucket);
      notify(bucket);
    }
  };

  const load = (email: string): Promise<void> => {
    const bucket = getBucket(email);
    if (bucket.loaded) return Promise.resolve();
    if (bucket.loading) return bucket.loading;
    bucket.loading = backend
      .read(keyFor(email))
      .then(
        (raw) => {
          mergeStored(bucket, raw);
          bucket.loaded = true;
        },
        () => undefined
      )
      .finally(() => {
        bucket.loading = null;
      });
    return bucket.loading;
  };

  const readMergeWrite = async (key: string, bucket: Bucket, onlyIfBehind: boolean): Promise<boolean> => {
    let touched: string[] = [];
    const attempt = async () => {
      const raw = await backend.read(key);
      catchUp(raw);
      touched = restampTouched(bucket);
      mergeStored(bucket, raw);
      bucket.loaded = true;
      const next = serialize(bucket.drafts, bucket.removed);
      if (onlyIfBehind && next === raw) return true;
      return await backend.write(key, next);
    };
    const ok = await attempt().catch(() => false);
    if (!ok) for (const date of touched) bucket.touched.add(date);
    return ok;
  };

  const persist = (key: string, bucket: Bucket, onlyIfBehind = false): Promise<boolean> => {
    const run = () => readMergeWrite(key, bucket, onlyIfBehind);
    const write = bucket.writing.then(() => (backend.exclusive ? backend.exclusive(key, run) : run()).catch(() => false));
    bucket.writing = write;
    return write;
  };

  const storedElsewhere = (key: string): Promise<boolean> => {
    const bucket = buckets.get(key);
    return bucket?.loaded ? persist(key, bucket, true) : Promise.resolve(true);
  };

  const update = (email: string, date: string, next: LocalDevotionalDraft | null) => {
    const bucket = getBucket(email);
    const drafts = { ...bucket.drafts };
    const at = stamp();
    if (next) {
      drafts[date] = { ...next, savedAt: at };
    } else {
      delete drafts[date];
      bucket.removed = { ...bucket.removed, [date]: at };
    }
    bucket.drafts = drafts;
    bucket.touched.add(date);
    recomputeDirty(bucket);
    notify(bucket);
    return persist(keyFor(email), bucket);
  };

  const saveLocal = async (
    email: string,
    date: string,
    content: DevotionalContent,
    baseIfNew: number | null,
    now = Date.now()
  ): Promise<{ draft: LocalDevotionalDraft; persisted: boolean }> => {
    const bucket = getBucket(email);
    const current = bucket.drafts[date];
    const pending = update(email, date, {
      date,
      passage: content.passage,
      notes: content.notes,
      prayerPoints: content.prayerPoints,
      updatedAt: now,
      dirty: true,
      base: current?.dirty ? current.base : baseIfNew,
      conflict: current?.dirty === true && current.conflict,
    });
    const draft = bucket.drafts[date];
    const persisted = await pending;
    return { draft: bucket.drafts[date] ?? draft, persisted };
  };

  const markSynced = async (
    email: string,
    date: string,
    sent: DevotionalContent,
    saved: SavedOnServer
  ): Promise<void> => {
    const current = getBucket(email).drafts[date];
    if (!current) return;
    const base = saved.deleted ? null : saved.updatedAt;
    if (!sameDevotionalContent(current, sent)) {
      await update(email, date, { ...current, base, conflict: false });
      return;
    }
    await update(email, date, {
      ...current,
      passage: saved.passage,
      updatedAt: saved.updatedAt,
      dirty: false,
      base,
      conflict: false,
    });
  };

  const markConflict = async (email: string, date: string, sentBase: number | null): Promise<void> => {
    const current = getBucket(email).drafts[date];
    if (!current?.dirty || current.conflict || current.base !== sentBase) return;
    await update(email, date, { ...current, conflict: true });
  };

  const keepMine = async (email: string, date: string, remote: DevotionalEntry | null): Promise<void> => {
    const current = getBucket(email).drafts[date];
    if (!current?.dirty) return;
    await update(email, date, { ...current, base: remote?.updatedAt ?? null, conflict: false });
  };

  const takeTheirs = async (email: string, date: string, remote: DevotionalEntry | null): Promise<void> => {
    await update(
      email,
      date,
      remote ? { ...remote, dirty: false, base: remote.updatedAt, conflict: false } : null
    );
  };

  const persistNow = (email: string): Promise<boolean> => persist(keyFor(email), getBucket(email));

  const getDrafts = (email: string | null | undefined): Readonly<Record<string, LocalDevotionalDraft>> =>
    email ? getBucket(email).drafts : EMPTY_DEVOTIONAL_MAP;

  const getDirty = (email: string | null | undefined): readonly LocalDevotionalDraft[] =>
    email ? getBucket(email).dirty : EMPTY_DIRTY_DEVOTIONALS;

  const subscribe = (email: string | null | undefined, listener: () => void) => {
    if (!email) return () => {};
    const bucket = getBucket(email);
    bucket.listeners.add(listener);
    void load(email);
    return () => {
      bucket.listeners.delete(listener);
    };
  };

  return {
    load,
    saveLocal,
    persistNow,
    storedElsewhere,
    markSynced,
    markConflict,
    keepMine,
    takeTheirs,
    getDrafts,
    getDirty,
    subscribe,
  };
};
