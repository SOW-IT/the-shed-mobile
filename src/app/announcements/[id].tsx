import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Card, EmptyState, LoadingState, Muted, Screen, SectionTitle } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

const STATUS_LABELS = { scheduled: "Scheduled", sent: "Sent", cancelled: "Cancelled" } as const;
const NOT_SENT_LABEL = "Not sent";

const dateText = (ms: number) =>
  new Date(ms).toLocaleString("en-AU", {
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
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const announcement = useQuery(api.announcements.get, id ? { id } : "skip");
  const markRead = useMutation(api.notifications.markReadForAnnouncement);
  const [showNotSeen, setShowNotSeen] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  const loadedId = announcement?.id;
  useEffect(() => {
    if (loadedId) void markRead({ announcementId: loadedId }).catch(() => {});
  }, [loadedId, markRead]);

  if (!authLoading && !isAuthenticated) {
    return (
      <Screen title="Announcement" onBack={back}>
        <SignInPrompt what="announcement" />
      </Screen>
    );
  }
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
                {details.notSentReason ? NOT_SENT_LABEL : STATUS_LABELS[details.status]} ·{" "}
                {details.audience}
              </Muted>
              {details.notSentReason ? (
                <View style={[styles.notSent, { backgroundColor: t.warningSoft }]}>
                  <Ionicons name="alert-circle-outline" size={18} color={t.warning} />
                  <Text style={[typography.caption, { color: t.text, flex: 1 }]}>
                    {details.notSentReason}
                  </Text>
                </View>
              ) : details.people !== null ? (
                <Muted>
                  {details.people} {details.people === 1 ? "person" : "people"} ·{" "}
                  {details.withApp} by push
                  {details.sendEmail ? ` · ${details.emailed} by email` : ""}
                </Muted>
              ) : (
                <Muted>{details.sendEmail ? "Push and email" : "Push only"}</Muted>
              )}
            </Card>
            {details.seen ? (
              <>
                <SectionTitle>Seen</SectionTitle>
                <Card>
                  <Text style={[typography.headline, { color: t.text }]}>
                    Seen by {details.seen.count} of {details.seen.total}
                  </Text>
                  <View style={[styles.bar, { backgroundColor: t.separator }]}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          backgroundColor: t.success,
                          width: `${
                            details.seen.total > 0
                              ? Math.round((100 * details.seen.count) / details.seen.total)
                              : 0
                          }%`,
                        },
                      ]}
                    />
                  </View>
                  <Muted>
                    Someone has seen it once they open it, or open their notifications after it
                    arrived.
                  </Muted>
                  {details.seen.notSeen.length > 0 ? (
                    <>
                      <Pressable
                        onPress={() => setShowNotSeen((v) => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showNotSeen ? "Hide who hasn't seen it" : "Show who hasn't seen it"
                        }
                        style={({ pressed }) => [styles.notSeenToggle, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={[typography.label, { color: t.primary }]}>
                          Not seen yet · {details.seen.notSeen.length}
                        </Text>
                        <Ionicons
                          name={showNotSeen ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={t.primary}
                        />
                      </Pressable>
                      {showNotSeen
                        ? details.seen.notSeen.map((person) => (
                            <View key={person.email} style={styles.person}>
                              <Text style={[typography.body, { color: t.text }]}>{person.name}</Text>
                              {person.name !== person.email ? (
                                <Text style={[typography.caption, { color: t.muted }]}>
                                  {person.email}
                                </Text>
                              ) : null}
                            </View>
                          ))
                        : null}
                    </>
                  ) : (
                    <Text style={[typography.label, { color: t.success }]}>Everyone has seen it.</Text>
                  )}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  notSent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: { height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  notSeenToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  person: { gap: 1, paddingVertical: 2 },
});
