// React keys that follow the item, not its position. With an index key, a
// row added or removed above another hands that row's state (an open
// picker, a fade-in, a focused input) to its neighbour.

/**
 * Keys from each item's own label. A repeated label gets a count, so
 * "Gospel" twice is "Gospel" and "Gospel\u00002".
 */
export const keysFor = (labels: readonly string[]): string[] => {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label}\u0000${count}`;
  });
};

/** Each item with its key from `keysFor`, for keying inside a `.map`. */
export const keyed = <T>(items: readonly T[], label: (item: T) => string) => {
  const keys = keysFor(items.map(label));
  return items.map((item, index) => ({ item, key: keys[index], index }));
};

/** Row ids for an editable list that has nothing to key on. */
export type RowIds = { ids: number[]; next: number };

export const rowIdsFor = (count: number): RowIds => ({ ids: Array.from({ length: count }, (_, i) => i), next: count });

export const withRowAdded = (rows: RowIds): RowIds => ({ ids: [...rows.ids, rows.next], next: rows.next + 1 });

export const withRowRemoved = (rows: RowIds, index: number): RowIds => ({
  ids: rows.ids.filter((_, i) => i !== index),
  next: rows.next,
});

/** The key for the row at `index`. A row the ids don't cover yet gets one of its own. */
export const rowKey = (rows: RowIds, index: number) => String(rows.ids[index] ?? `new-${index}`);
