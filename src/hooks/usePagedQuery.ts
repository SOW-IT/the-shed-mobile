import { useQueries } from "convex/react";
import { type FunctionReference, getFunctionName, makeFunctionReference } from "convex/server";
import { convexToJson, type JSONValue, jsonToConvex, type Value } from "convex/values";
import { type MutableRefObject, useCallback, useEffect, useMemo, useState } from "react";

type PageResult = { isDone: boolean; continueCursor: string | null };

type PagedQueryRef = FunctionReference<"query", "public", any, PageResult | null>;

type Requests = Record<string, { query: FunctionReference<"query">; args: Record<string, Value> }>;

const EMPTY: never[] = [];

const FIRST_PAGE: (string | null)[] = [null];

const chainedCursors = (
  cursors: (string | null)[],
  pages: (PageResult | null | undefined)[]
): (string | null)[] => {
  const next = [cursors[0]];
  for (let i = 1; i < cursors.length; i++) {
    const before = pages[i - 1];
    if (before === undefined) {
      next.push(cursors[i]);
      continue;
    }
    if (before === null || before.isDone || before.continueCursor == null) break;
    next.push(before.continueCursor);
  }
  return next;
};

const sameList = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, i) => item === b[i]);

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
    /** Keep the previous scope's rows on screen while the new one loads. */
    keepRowsWhileLoading?: boolean;
  }
): {
  rows: Row[];
  result: Query["_returnType"] | undefined;
  hasMore: boolean;
  loadMore: () => void;
  loadingFirstPage: boolean;
  /** Rows shown are the previous scope's, held while the new one loads. */
  refreshing: boolean;
} {
  const { scopeKey, loadMoreRef, rowsOf, keyOf } = opts;

  const [paging, setPaging] = useState<{ scopeKey: string; cursors: (string | null)[] }>({
    scopeKey,
    cursors: FIRST_PAGE,
  });
  const cursors = paging.scopeKey === scopeKey ? paging.cursors : FIRST_PAGE;

  const argsKey = JSON.stringify(
    cursors.map((cursor) => {
      const args = opts.args(cursor);
      return args === "skip" ? null : convexToJson(args as Value);
    })
  );
  const queryName = getFunctionName(query);
  const requests = useMemo(() => {
    const ref = makeFunctionReference<"query">(queryName);
    const out: Requests = {};
    (JSON.parse(argsKey) as (JSONValue | null)[]).forEach((args, i) => {
      if (args !== null) {
        out[String(i)] = { query: ref, args: jsonToConvex(args) as Record<string, Value> };
      }
    });
    return out;
  }, [argsKey, queryName]);
  const results = useQueries(requests);
  const pages = cursors.map((_, i) => {
    const result = results[String(i)];
    if (result instanceof Error) throw result;
    return result as Query["_returnType"] | undefined;
  });

  const chained = chainedCursors(cursors, pages);
  const chainMoved = paging.scopeKey === scopeKey && !sameList(chained, cursors);
  if (chainMoved) setPaging({ scopeKey, cursors: chained });

  const [held, setHeld] = useState<{ scopeKey: string; pages: (Query["_returnType"] | undefined)[] }>({
    scopeKey,
    pages: [],
  });
  const heldPages = held.scopeKey === scopeKey ? held.pages : EMPTY;
  const shown = pages.map((page, i) => page ?? heldPages[i]);
  if (
    (pages[0] !== undefined || held.scopeKey === scopeKey) &&
    !(held.scopeKey === scopeKey && sameList(shown, held.pages))
  ) {
    setHeld({ scopeKey, pages: shown });
  }

  const holding =
    held.scopeKey !== scopeKey && Boolean(opts.keepRowsWhileLoading) && pages[0] === undefined;
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const page of holding ? held.pages : shown) {
    if (page == null) continue;
    for (const row of rowsOf(page as NonNullable<Query["_returnType"]>)) {
      const key = keyOf(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  const last = shown[shown.length - 1];
  const hasMore = last != null && !last.isDone;
  const lastFresh = pages[pages.length - 1];
  const nextCursor =
    lastFresh != null && !lastFresh.isDone ? lastFresh.continueCursor : null;
  const pageCount = cursors.length;
  const lastPageEmpty =
    !chainMoved &&
    lastFresh != null &&
    nextCursor != null &&
    nextCursor !== cursors[pageCount - 1] &&
    rowsOf(lastFresh as NonNullable<Query["_returnType"]>).length === 0;
  if (lastPageEmpty) setPaging({ scopeKey, cursors: [...cursors, nextCursor] });

  const loadMore = useCallback(() => {
    if (nextCursor == null) return;
    setPaging((prev) => {
      const base = prev.scopeKey === scopeKey ? prev.cursors : FIRST_PAGE;
      return base.length === pageCount ? { scopeKey, cursors: [...base, nextCursor] } : prev;
    });
  }, [nextCursor, pageCount, scopeKey]);

  useEffect(() => {
    if (!loadMoreRef) return;
    loadMoreRef.current = hasMore ? loadMore : null;
    return () => {
      loadMoreRef.current = null;
    };
  }, [loadMoreRef, hasMore, loadMore]);

  return {
    rows: holding || rows.length > 0 ? rows : (EMPTY as Row[]),
    result: shown[0],
    hasMore,
    loadMore,
    loadingFirstPage: shown[0] === undefined && rows.length === 0,
    refreshing: holding,
  };
}
