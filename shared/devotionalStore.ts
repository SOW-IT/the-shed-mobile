import {
  parseDraftStore,
  type DevotionalContent,
  type LocalDevotionalDraft,
} from "./devotionals";

export type DevotionalStorageBackend = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<boolean>;
};

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
    writeSeq: number;
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
        writeSeq: 0,
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
      .then((raw) => {
        bucket.loaded = true;
        if (!raw) return;
        const parsed = parseDraftStore(raw);
        let changed = false;
        const merged: Record<string, LocalDevotionalDraft> = { ...bucket.drafts };
        for (const [date, stored] of Object.entries(parsed)) {
          const current = merged[date];
          if (!current || stored.updatedAt > current.updatedAt) {
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

  const persist = async (email: string, bucket: Bucket) => {
    bucket.writeSeq++;
    const payload = JSON.stringify(bucket.drafts);
    return await backend.write(keyFor(email), payload);
  };

  const saveLocal = async (
    email: string,
    date: string,
    content: DevotionalContent,
    now = Date.now()
  ): Promise<LocalDevotionalDraft> => {
    const bucket = getBucket(email);
    const draft: LocalDevotionalDraft = {
      date,
      passage: content.passage,
      notes: content.notes,
      prayerPoints: content.prayerPoints,
      updatedAt: now,
      dirty: true,
    };
    bucket.drafts = { ...bucket.drafts, [date]: draft };
    recomputeDirty(bucket);
    notify(bucket);
    await persist(email, bucket);
    return draft;
  };

  const markSynced = async (
    email: string,
    date: string,
    savedPassage: string,
    draftUpdatedAt: number,
    serverUpdatedAt: number
  ): Promise<void> => {
    const bucket = getBucket(email);
    const current = bucket.drafts[date];
    if (!current || current.updatedAt !== draftUpdatedAt) return;
    bucket.drafts = {
      ...bucket.drafts,
      [date]: {
        ...current,
        passage: savedPassage,
        updatedAt: serverUpdatedAt,
        dirty: false,
      },
    };
    recomputeDirty(bucket);
    notify(bucket);
    await persist(email, bucket);
  };

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

  return { load, saveLocal, markSynced, getDrafts, getDirty, subscribe };
};
