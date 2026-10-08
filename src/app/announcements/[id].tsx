import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import { Card, EmptyState, LoadingState, Muted, Screen, SectionTitle } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const STATUS_LABELS = { scheduled: "Scheduled", sent: "Sent", cancelled: "Cancelled" } as const;

const dateText = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** An announcement, as a recipient sees it after tapping the push or the bell. */
export default function AnnouncementScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const announcement = useQuery(api.announcements.get, id ? { id } : "skip");
  const markRead = useMutation(api.notifications.markReadForAnnouncement);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  const loadedId = announcement?.id;
  useEffect(() => {
    if (loadedId) void markRead({ announcementId: loadedId }).catch(() => {});
  }, [loadedId, markRead]);

  if (announcement === undefined) return <LoadingState />;
  if (announcement === null) {
    return (
      <Screen title="Announcement" onBack={back}>
        <EmptyState icon="megaphone-outline" title="Announcement not found" />
      </Screen>
    );
  }

  const details = announcement.details;
  return (
    <Screen title="Announcement" onBack={back} maxWidth={720}>
      <View style={{ gap: spacing.md }}>
        <Card>
          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: t.primarySoft }]}>
              <Ionicons name="megaphone" size={20} color={t.dark ? t.text : t.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.title, { color: t.text }]}>{announcement.title}</Text>
              <Muted>
                {announcement.senderName} · {dateText(announcement.at)}
              </Muted>
            </View>
          </View>
          <Text selectable style={[typography.body, { color: t.text }]}>
            {announcement.message}
          </Text>
        </Card>
        {details ? (
          <>
            <SectionTitle>Delivery</SectionTitle>
            <Card>
              <Muted>
                {STATUS_LABELS[details.status]} · {details.audience}
              </Muted>
              {details.people !== null ? (
                <Muted>
                  {details.people} {details.people === 1 ? "person" : "people"} ·{" "}
                  {details.withApp} by push
                  {details.sendEmail ? ` · ${details.emailed} by email` : ""}
                </Muted>
              ) : (
                <Muted>{details.sendEmail ? "Push and email" : "Push only"}</Muted>
              )}
            </Card>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
