import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { compactAgo } from "@shared/datetime";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  Screen,
  stagger,
  Txt,
} from "@/components/ui";

export default function NotificationsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const notifications = useQuery(api.notifications.list, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const reopenCounter = useRef(0);
  const goBack = router.canGoBack() ? () => router.back() : undefined;

  useFocusEffect(
    useCallback(() => {
      if (!notifications?.some((n) => !n.read)) return;
      void markAllRead({}).catch((err: unknown) => {
        console.warn("markAllRead failed", err);
      });
    }, [notifications, markAllRead])
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

  if (notifications === undefined) {
    return (
      <Screen title="Notifications" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  const list = notifications ?? [];
  const unread = list.filter((n) => !n.read);
  const read = list.filter((n) => n.read);

  const renderRow = (n: (typeof list)[number], index: number) => (
    <FadeInView key={n.id} delay={stagger(index)}>
      <Pressable
        onPress={() => open(n.id, n.url)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.row,
          t.shadowCard,
          { backgroundColor: n.read ? t.card : t.primarySoft },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: n.read ? t.ghost : t.card }]}>
          <Ionicons name="notifications" size={18} color={n.read ? t.faint : t.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt style={{ fontWeight: n.read ? "600" : "800" }}>{n.title}</Txt>
          {n.body ? (
            <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
              {n.body}
            </Text>
          ) : null}
          <Text style={[typography.caption, { color: t.faint }]}>{compactAgo(n.at)}</Text>
        </View>
        {!n.read ? (
          <View style={[styles.unreadDot, { backgroundColor: t.primary }]} />
        ) : null}
      </Pressable>
    </FadeInView>
  );

  return (
    <Screen title="Notifications" onBack={goBack}>
      {list.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications"
          message="Updates about your requests and approvals will show up here."
        />
      ) : (
        <>
          {unread.length > 0 ? (
            <>
              <Text style={[typography.label, styles.sectionLabel, { color: t.muted }]}>
                Unread
              </Text>
              {unread.map((n, i) => renderRow(n, i))}
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
              {read.map((n, i) => renderRow(n, unread.length + i))}
            </>
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
});
