import type { FunctionReference, PaginationOptions } from "convex/server";
import { type MutableRefObject, type ReactNode, useMemo } from "react";
import { View } from "react-native";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { Btn, SectionTitle, SowSpinner } from "@/components/ui";
import { spacing } from "@/theme";

const PAGE_SIZE = 20;

type EarlierPage<Row> = { page: Row[]; isDone: boolean; continueCursor: string | null };

type EarlierQuery<Row> = FunctionReference<
  "query",
  "public",
  { paginationOpts: PaginationOptions },
  EarlierPage<Row> | null
>;

type YearGroup<Row> = { year: number; rows: Row[] };

export function useEarlierYears<Row extends { _id: string }>(
  query: EarlierQuery<Row>,
  {
    enabled,
    exclude,
    keep,
    yearOf,
    newestOf,
    loadMoreRef,
    pageSize = PAGE_SIZE,
  }: {
    enabled: boolean;
    exclude: readonly string[];
    keep?: (row: Row) => boolean;
    yearOf: (row: Row) => number;
    newestOf: (row: Row) => number;
    loadMoreRef?: MutableRefObject<(() => void) | null>;
    pageSize?: number;
  }
) {
  const excluded = new Set(exclude);
  const { rows, hasMore, loadMore, loadingMore } = usePagedQuery(query, {
    scopeKey: enabled ? "earlier" : "off",
    args: (cursor) =>
      enabled ? { paginationOpts: { numItems: pageSize, cursor } } : "skip",
    rowsOf: (result) =>
      result.page.filter((row) => !excluded.has(row._id) && (keep?.(row) ?? true)),
    keyOf: (row) => row._id,
    loadMoreRef,
  });
  const groups = useMemo(() => {
    const byYear = new Map<number, Row[]>();
    for (const row of rows) {
      const year = yearOf(row);
      const inYear = byYear.get(year);
      if (inYear) inYear.push(row);
      else byYear.set(year, [row]);
    }
    return [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, inYear]): YearGroup<Row> => ({
        year,
        rows: [...inYear].sort((a, b) => newestOf(b) - newestOf(a)),
      }));
  }, [rows, yearOf, newestOf]);
  return { groups, hasMore, loadMore, loadingMore };
}

export function EarlierYears<Row>({
  groups,
  hasMore,
  loadingMore,
  onLoadMore,
  heading = (year) => `${year} staff year`,
  note,
  renderRows,
}: {
  groups: YearGroup<Row>[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  heading?: (year: number) => string;
  note?: (year: number) => ReactNode;
  renderRows: (rows: Row[]) => ReactNode;
}) {
  return (
    <>
      {groups.map(({ year, rows }) => (
        <View key={year} style={{ gap: spacing.sm }}>
          <SectionTitle>{hasMore ? heading(year) : `${heading(year)} · ${rows.length}`}</SectionTitle>
          {note?.(year)}
          {renderRows(rows)}
        </View>
      ))}
      {hasMore ? (
        <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
          {loadingMore ? (
            <SowSpinner size={36} />
          ) : (
            <Btn title="Show earlier" variant="ghost" onPress={onLoadMore} />
          )}
        </View>
      ) : null}
    </>
  );
}
