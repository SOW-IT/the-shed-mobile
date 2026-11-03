import { type MutableRefObject, type ReactNode, useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { requestDeclined, requestStaffYear } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import type { RequestPrefill } from "@/components/MyRequests";
import { ReceiptFilesNote } from "@/components/ReceiptFilesNote";
import { RequestCard } from "@/components/RequestCard";
import { useScrollBy } from "@/components/ui/scrollAnchor";
import {
  EmptyState,
  FadeInView,
  Grid,
  IconButton,
  LoadingState,
  SectionTitle,
  SowSpinner,
  stagger,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export const PAST_PAGE_SIZE = 10;

type YearRun = { year: number; start: number; rows: Doc<"requests">[] };

const runsByYear = (rows: Doc<"requests">[]): YearRun[] => {
  const runs: YearRun[] = [];
  rows.forEach((row, at) => {
    const year = requestStaffYear(row);
    const last = runs[runs.length - 1];
    if (last && last.year === year) last.rows.push(row);
    else runs.push({ year, start: at, rows: [row] });
  });
  return runs;
};

const endLabel = (total: number) =>
  total === 1 ? "That's your only past request." : `That's all ${total} past requests.`;

const YearDivider = ({ year }: { year: number }) => {
  const t = useAppTheme();
  return (
    <View style={styles.divider} accessibilityRole="header">
      <Text style={[typography.label, { color: t.text }]}>{`Staff year ${year}`}</Text>
      <Text style={[typography.caption, { color: t.faint }]}>
        {`Oct ${year - 1} to Sep ${year}`}
      </Text>
      <View style={[styles.rule, { backgroundColor: t.separator }]} />
    </View>
  );
};

export const PastRequests = ({
  account,
  loadMoreRef,
  linked,
  focusThread = false,
  focusReopenKey,
  onFocusThreadOpened,
  onResubmit,
}: {
  account: string;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
  linked?: Doc<"requests"> | null;
  focusThread?: boolean;
  focusReopenKey?: string;
  onFocusThreadOpened?: () => void;
  onResubmit?: (prefill: RequestPrefill) => void;
}) => {
  const t = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { rows, hasMore, loadMore, loadingFirstPage, loadingMore } = usePagedQuery(
    api.requests.earlierMine,
    {
      scopeKey: `past:${account}`,
      args: (cursor) => ({ paginationOpts: { numItems: PAST_PAGE_SIZE, cursor } }),
      rowsOf: (result) => result.page,
      keyOf: (row) => row._id,
      loadMoreRef,
    }
  );
  const shown = linked ? rows.filter((row) => row._id !== linked._id) : rows;
  const scrollBy = useScrollBy();
  const linkKey = linked ? `${linked._id}:${focusReopenKey ?? ""}` : null;
  useEffect(() => {
    if (linkKey !== null) scrollBy(-Number.MAX_SAFE_INTEGER);
  }, [linkKey, scrollBy]);
  const [measured, setMeasured] = useState({ count: -1, height: 0 });
  const shortOfScreen = measured.count === shown.length && measured.height < windowHeight;
  useEffect(() => {
    if (shortOfScreen && hasMore && !loadingMore) loadMore();
  }, [shortOfScreen, hasMore, loadingMore, loadMore]);

  const total = shown.length + (linked ? 1 : 0);
  const more = hasMore || loadingMore;
  if (loadingFirstPage && !linked) return <LoadingState />;
  if (total === 0 && !more) {
    return (
      <EmptyState
        icon="time-outline"
        title="No past requests"
        message="Requests you made in earlier staff years show up here."
      />
    );
  }

  const years = [
    ...new Set([...(linked ? [requestStaffYear(linked)] : []), ...shown.map(requestStaffYear)]),
  ];

  const card = (request: Doc<"requests">, isLinked: boolean): ReactNode => (
    <RequestCard
      request={request}
      collapsible
      autoExpand={isLinked}
      autoOpenThread={isLinked && focusThread}
      deepLinkOpenKey={isLinked ? focusReopenKey : undefined}
      onAutoOpenThread={isLinked ? onFocusThreadOpened : undefined}
    >
      {onResubmit && requestDeclined(request) ? (
        <IconButton
          name="refresh"
          bg={t.primarySoft}
          color={t.primary}
          accessibilityLabel="Resubmit request"
          onPress={() =>
            onResubmit({
              description: request.description,
              amount: String(request.amount),
              department: request.department,
            })
          }
        />
      ) : null}
    </RequestCard>
  );

  return (
    <View
      testID="past-requests"
      style={styles.list}
      onLayout={(e) => setMeasured({ count: shown.length, height: e.nativeEvent.layout.height })}
    >
      <ReceiptFilesNote years={years} />
      {linked ? (
        <View style={styles.group}>
          <SectionTitle>From your link</SectionTitle>
          <Grid minColumnWidth={380}>
            <FadeInView key={linked._id}>{card(linked, true)}</FadeInView>
          </Grid>
        </View>
      ) : null}
      {runsByYear(shown).map((run) => (
        <View key={run.year} style={styles.group}>
          <YearDivider year={run.year} />
          <Grid minColumnWidth={380}>
            {run.rows.map((request, offset) => {
              const at = run.start + offset;
              return at < PAST_PAGE_SIZE ? (
                <FadeInView key={request._id} delay={stagger(at)}>
                  {card(request, false)}
                </FadeInView>
              ) : (
                <View key={request._id}>{card(request, false)}</View>
              );
            })}
          </Grid>
        </View>
      ))}
      {more ? (
        <View style={styles.more}>
          <SowSpinner size={36} />
        </View>
      ) : (
        <Text style={[typography.caption, styles.end, { color: t.faint }]}>{endLabel(total)}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  group: { gap: spacing.sm },
  divider: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, alignSelf: "center" },
  more: { alignItems: "center", paddingVertical: spacing.md },
  end: { textAlign: "center", paddingVertical: spacing.md },
});
