import { ChromeScreen } from "@/components/ChromeScreen";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { SignInPrompt } from "@/components/SignInPrompt";
import { useWideLayout } from "@/components/nav/layout";
import { LoadingState } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { todayDevotionalDate } from "@shared/devotionals";
import { useConvexAuth, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { DevotionalGroupsTab } from "./DevotionalGroupsTab";
import { DevotionalYoursTab } from "./DevotionalYoursTab";

type TabKey = "yours" | "groups";

const TodayButton = ({ onPress }: { onPress: () => void }) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open today's devotional"
      testID="devotionals-today"
      hitSlop={6}
      style={({ pressed }) => [styles.today, { backgroundColor: t.primary }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>Today</Text>
    </Pressable>
  );
};

export const DevotionalsScreen = ({ onBack }: { onBack?: () => void }) => {
  const t = useAppTheme();
  const router = useRouter();
  const wide = useWideLayout();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [tab, setTab] = useState<TabKey>(params.tab === "groups" ? "groups" : "yours");
  const today = todayDevotionalDate();
  const summary = useQuery(api.devotionalGroups.mySummary, isAuthenticated ? { today } : "skip");
  const inviteCount = summary?.invites.length ?? 0;

  if (isLoading) return <LoadingState />;
  if (!isAuthenticated) {
    return (
      <ChromeScreen onBack={onBack}>
        <SignInPrompt what="page" />
      </ChromeScreen>
    );
  }

  const openToday = () => router.push(`/devotionals/${today}`);
  const title = <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>Devotionals</Text>;
  const page = (content: ReactNode) =>
    wide ? (
      <>
        <View style={styles.wideHeader}>
          <View style={styles.wideTitle}>
            <Ionicons name="book-outline" size={26} color={t.primary} />
            <Text style={[typography.largeTitle, { color: t.text }]}>Devotionals</Text>
          </View>
          <TodayButton onPress={openToday} />
        </View>
        {content}
      </>
    ) : (
      content
    );

  const tabs: PagerTab[] = [
    { key: "yours", label: "Yours", render: () => page(<DevotionalYoursTab />) },
    {
      key: "groups",
      label: "Groups",
      badge: inviteCount > 0 ? inviteCount : undefined,
      render: () => page(<DevotionalGroupsTab />),
    },
  ];

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={tab}
      onActiveKeyChange={(key) => setTab(key as TabKey)}
      onBack={onBack}
      title={title}
      topBarRight={<TodayButton onPress={openToday} />}
    />
  );
};

const styles = StyleSheet.create({
  today: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  wideHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  wideTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
});
