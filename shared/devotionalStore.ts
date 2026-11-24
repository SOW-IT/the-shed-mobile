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
};

type SavedOnServer = { passage: string; deleted: boolean; updatedAt: number };

export const EMPTY_DEVOTIONAL_MAP: Readonly<Record<string, LocalDevotionalDraft>> = {};
export const EMPTY_DIRTY_DEVOTIONALS: readonly LocalDevotionalDraft[] = [];

const keyFor = (email: string) => `devotionals.drafts.${email.trim().toLowerCase()}`;

export const createDevotionalStore = (backend: DevotionalStorageBackend) => {
  type Bucket = {
    drafts: Record<string, LocalDevotionalDraft>;
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

  const load = (email: string): Promise<void> => {
    const k = keyFor(email);
    const bucket = getBucket(email);
    if (bucket.loaded) return Promise.resolve();
    if (bucket.loading) return bucket.loading;
    bucket.loading = backend
      .read(k)
      .catch(() => null)
      .then((raw) => {
        bucket.loaded = true;
        if (!raw) return;
        const parsed = parseDraftStore(raw);
        let changed = false;
        const merged: Record<string, LocalDevotionalDraft> = { ...bucket.drafts };
        for (const [date, stored] of Object.entries(parsed)) {
          if (!merged[date]) {
            merged[date] = stored;
            changed = true;
          }
        }
        if (changed) {
          bucket.drafts = merged;
          recomputeDirty(bucket);
          notify(bucket);
        }
      })
      .finally(() => {
        bucket.loading = null;
      });
    return bucket.loading;
  };

  const persist = async (email: string, bucket: Bucket): Promise<boolean> => {
    await load(email);
    const write = bucket.writing.then(() =>
      backend.write(keyFor(email), JSON.stringify(bucket.drafts)).catch(() => false)
    );
    bucket.writing = write;
    return await write;
  };

  const update = (email: string, date: string, next: LocalDevotionalDraft | null) => {
    const bucket = getBucket(email);
    const drafts = { ...bucket.drafts };
    if (next) drafts[date] = next;
    else delete drafts[date];
    bucket.drafts = drafts;
    recomputeDirty(bucket);
    notify(bucket);
    return persist(email, bucket);
  };

  const saveLocal = async (
    email: string,
    date: string,
    content: DevotionalContent,
    baseIfNew: number | null,
    now = Date.now()
  ): Promise<{ draft: LocalDevotionalDraft; persisted: boolean }> => {
    const current = getBucket(email).drafts[date];
    const draft: LocalDevotionalDraft = {
      date,
      passage: content.passage,
      notes: content.notes,
      prayerPoints: content.prayerPoints,
      updatedAt: now,
      dirty: true,
      base: current?.dirty ? current.base : baseIfNew,
      conflict: current?.dirty === true && current.conflict,
    };
    const persisted = await update(email, date, draft);
    return { draft, persisted };
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

  const markConflict = async (email: string, date: string): Promise<void> => {
    const current = getBucket(email).drafts[date];
    if (!current?.dirty || current.conflict) return;
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

  const persistNow = (email: string): Promise<boolean> => persist(email, getBucket(email));

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
    markSynced,
    markConflict,
    keepMine,
    takeTheirs,
    getDrafts,
    getDirty,
    subscribe,
  };
};
