import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type PageResult = { isDone: boolean; continueCursor: string | null };

type PagedQueryRef = FunctionReference<"query", "public", any, PageResult | null>;

const EMPTY: never[] = [];

/**
 * Cursor-paginated Convex query whose pages accumulate into one list.
 *
 * The app's list queries use app-specific cursors, so Convex's own
 * `usePaginatedQuery` does not fit; this hook owns the cursor and the
 * accumulated rows instead. Changing `scopeKey` (search, filters, the selected
 * sub-group…) restarts from the first page synchronously, so a stale cursor is
 * never sent with the new arguments.
 */
export function usePagedQuery<Query extends PagedQueryRef, Row>(
  query: Query,
  opts: {
    /** Arguments for the page at `cursor` (`null` = first page), or "skip". */
    args: (cursor: string | null) => Query["_args"] | "skip";
    /** Identity of the list being paged; a change resets to page one. */
    scopeKey: string;
    rowsOf: (result: NonNullable<Query["_returnType"]>) => readonly Row[];
    keyOf: (row: Row) => string;
    /** Lets a parent pager trigger `loadMore` when its scroll reaches the end. */
    loadMoreRef?: MutableRefObject<(() => void) | null>;
  }
): {
  rows: Row[];
  result: Query["_returnType"] | undefined;
  hasMore: boolean;
  loadMore: () => void;
  loadingFirstPage: boolean;
} {
  const { scopeKey, loadMoreRef } = opts;
  // Callbacks are read from a ref inside effects so that inline `rowsOf` /
  // `keyOf` closures never retrigger the accumulation effect.
  const latest = useRef(opts);
  useEffect(() => {
    latest.current = opts;
  });

  const [paging, setPaging] = useState<{ scopeKey: string; cursor: string | null }>({
    scopeKey,
    cursor: null,
  });
  const cursor = paging.scopeKey === scopeKey ? paging.cursor : null;

  const typedUseQuery = useQuery as (
    q: Query,
    a: Query["_args"] | "skip"
  ) => Query["_returnType"] | undefined;
  const result = typedUseQuery(query, opts.args(cursor));

  const [acc, setAcc] = useState<{ scopeKey: string; rows: Row[] }>({
    scopeKey,
    rows: [],
  });
  useEffect(() => {
    if (result === undefined || result === null) return;
    const { rowsOf, keyOf } = latest.current;
    const incoming = rowsOf(result as NonNullable<Query["_returnType"]>);
    setAcc((prev) => {
      if (!cursor || prev.scopeKey !== scopeKey) return { scopeKey, rows: [...incoming] };
      const seen = new Set(prev.rows.map(keyOf));
      return {
        scopeKey,
        rows: [...prev.rows, ...incoming.filter((row) => !seen.has(keyOf(row)))],
      };
    });
  }, [result, cursor, scopeKey]);

  const rows = acc.scopeKey === scopeKey ? acc.rows : (EMPTY as Row[]);
  const hasMore = result != null && !result.isDone;
  const continueCursor = result?.continueCursor ?? null;

  const pending = useRef(false);
  useEffect(() => {
    pending.current = false;
  }, [cursor, result?.isDone]);
  const loadMore = useCallback(() => {
    if (pending.current || !hasMore || continueCursor == null) return;
    pending.current = true;
    setPaging({ scopeKey, cursor: continueCursor });
  }, [hasMore, continueCursor, scopeKey]);

  useEffect(() => {
    if (!loadMoreRef) return;
    loadMoreRef.current = hasMore ? loadMore : null;
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, hasMore, loadMore]);

  return {
    rows,
    result,
    hasMore,
    loadMore,
    loadingFirstPage: result === undefined && rows.length === 0,
  };
}
