import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { radius, spacing, typography, useAppTheme } from "../theme";
import {
  EmptyState,
  FadeInView,
  LoadingState,
  Screen,
  stagger,
  Txt,
} from "@/components/ui";

/** Compact "time ago" for the feed (e.g. now, 5m, 3h, 2d, 12 Jun). */
const ago = (ms: number): string => {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/**
 * The in-app notification feed: every flow event that pinged the caller, newest
 * first, with an unread dot. Tapping one marks it read and opens its target.
 */
export default function NotificationsScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const notifications = useQuery(api.notifications.list, {});
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const goBack = router.canGoBack() ? () => router.back() : undefined;

  const hasUnread = (notifications ?? []).some((n) => !n.read);

  const open = (id: Id<"notifications">, url: string | null) => {
    void markRead({ id });
    if (url) router.push(url as never);
  };

  const headerRight = hasUnread ? (
    <Pressable
      onPress={() => void markAllRead({})}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mark all notifications read"
      style={({ pressed }) => [
        styles.markAll,
        { backgroundColor: t.ghost },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>
        Mark all read
      </Text>
    </Pressable>
  ) : undefined;

  if (notifications === undefined) {
    return (
      <Screen title="Notifications" onBack={goBack}>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen title="Notifications" onBack={goBack} headerRight={headerRight}>
      {notifications === null || notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications"
          message="Updates about your requests and approvals will show up here."
        />
      ) : (
        notifications.map((n, index) => (
          <FadeInView key={n.id} delay={stagger(index)}>
            <Pressable
              onPress={() => open(n.id, n.url)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                t.shadowCard,
                {
                  backgroundColor: n.read ? t.card : t.primarySoft,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: n.read ? t.ghost : t.card },
                ]}
              >
                <Ionicons
                  name="notifications"
                  size={18}
                  color={n.read ? t.faint : t.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt style={{ fontWeight: n.read ? "600" : "800" }}>{n.title}</Txt>
                {n.body ? (
                  <Text
                    numberOfLines={2}
                    style={[typography.caption, { color: t.muted }]}
                  >
                    {n.body}
                  </Text>
                ) : null}
                <Text style={[typography.caption, { color: t.faint }]}>{ago(n.at)}</Text>
              </View>
              {!n.read ? (
                <View style={[styles.unreadDot, { backgroundColor: t.primary }]} />
              ) : null}
            </Pressable>
          </FadeInView>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  markAll: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
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
