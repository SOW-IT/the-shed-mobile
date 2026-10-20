import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "convex/react";
import { useFocusEffect, useRouter } from "expo-router";
import { appVersion } from "@/hooks/useReportAppVersion";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { compactAgo } from "@shared/datetime";
import {
  Btn,
  EmptyState,
  FadeInView,
  LoadingState,
  Screen,
  SowSpinner,
  stagger,
  Txt,
} from "@/components/ui";

const PAGE_SIZE = 30;

type FeedRow = {
  id: Id<"notifications">;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  at: number;
};

export default function NotificationsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const version = appVersion();
  const { rows, hasMore, loadMore, loadingFirstPage, loadingMore } = usePagedQuery(
    api.notifications.feed,
    {
      scopeKey: "feed",
      args: (cursor) => ({
        paginationOpts: { numItems: PAGE_SIZE, cursor },
        ...(version ? { appVersion: version } : {}),
      }),
      rowsOf: (page) => page.page as FeedRow[],
      keyOf: (row) => row.id,
    }
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const reopenCounter = useRef(0);
  const [unreadThisVisit, setUnreadThisVisit] = useState<ReadonlySet<string> | null>(null);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  useFocusEffect(useCallback(() => () => setUnreadThisVisit(null), []));

  const unreadKey = rows
    .filter((n) => !n.read)
    .map((n) => n.id)
    .join("|");
  useFocusEffect(
    useCallback(() => {
      if (loadingFirstPage) return;
      const unreadNow = unreadKey ? unreadKey.split("|") : [];
      setUnreadThisVisit((seen) =>
        seen && unreadNow.every((id) => seen.has(id)) ? seen : new Set([...(seen ?? []), ...unreadNow])
      );
      if (unreadNow.length === 0) return;
      void markAllRead({})
        .then((marked) => {
          if (!marked || marked.length === 0) return;
          setUnreadThisVisit((seen) => new Set([...(seen ?? []), ...marked]));
        })
        .catch((err: unknown) => {
          console.warn("markAllRead failed", err);
        });
    }, [loadingFirstPage, unreadKey, markAllRead])
  );

  const open = (id: Id<"notifications">, url: string | null) => {
    void markRead({ id });
    if (url) {
      const separator = url.includes("?") ? "&" : "?";
      reopenCounter.current += 1;
      const reopen = encodeURIComponent(`${id}:${reopenCounter.current}`);
      router.push(`${url}${separator}reopen=${reopen}` as never);
    }
  };

  if (loadingFirstPage) {
    return (
      <Screen title="Notifications" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  const shownUnread = (n: FeedRow) => !n.read || !!unreadThisVisit?.has(n.id);
  const unread = rows.filter(shownUnread);
  const read = rows.filter((n) => !shownUnread(n));

  const renderRow = (n: FeedRow, index: number, isUnread: boolean) => (
    <FadeInView key={n.id} delay={stagger(Math.min(index, 12))}>
      <Pressable
        onPress={() => open(n.id, n.url)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          t.surfaceEdge,
          { backgroundColor: isUnread ? t.primarySoft : t.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: isUnread ? t.card : t.ghost }]}>
          <Ionicons
            name={n.url?.startsWith("/announcements/") ? "megaphone" : "notifications"}
            size={18}
            color={isUnread ? t.primary : t.faint}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt style={{ fontWeight: isUnread ? "800" : "600" }}>{n.title}</Txt>
          {n.body ? (
            <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
              {n.body}
            </Text>
          ) : null}
          <Text style={[typography.caption, { color: t.faint }]}>{compactAgo(n.at)}</Text>
        </View>
        {isUnread ? (
          <View style={[styles.unreadDot, { backgroundColor: t.primary }]} />
        ) : null}
      </Pressable>
    </FadeInView>
  );

  return (
    <Screen title="Notifications" onBack={goBack} onEndReached={hasMore ? loadMore : undefined}>
      {rows.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications"
          message="Updates about your requests and approvals, and announcements, will show up here."
        />
      ) : (
        <>
          {unread.length > 0 ? (
            <>
              <Text style={[typography.label, styles.sectionLabel, { color: t.muted }]}>
                Unread
              </Text>
              {unread.map((n, i) => renderRow(n, i, true))}
            </>
          ) : null}
          {read.length > 0 ? (
            <>
              <Text
                style={[
                  typography.label,
                  styles.sectionLabel,
                  unread.length > 0 && styles.sectionLabelSpaced,
                  { color: t.muted },
                ]}
              >
                Read
              </Text>
              {read.map((n, i) => renderRow(n, unread.length + i, false))}
            </>
          ) : null}
          {loadingMore ? (
            <View style={styles.more}>
              <SowSpinner size={36} />
            </View>
          ) : hasMore ? (
            <View style={styles.more}>
              <Btn title="Show earlier" variant="ghost" onPress={loadMore} />
            </View>
          ) : rows.length >= PAGE_SIZE ? (
            <Text style={[typography.caption, styles.end, { color: t.faint }]}>
              {"That's everything."}
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { marginBottom: spacing.xs, marginLeft: 2 },
  sectionLabelSpaced: { marginTop: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: { width: 9, height: 9, borderRadius: 5 },
  more: { alignItems: "center", paddingVertical: spacing.md },
  end: { textAlign: "center", paddingVertical: spacing.md },
});
