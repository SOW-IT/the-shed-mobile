import { ChromeScreen } from "@/components/ChromeScreen";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { SignInPrompt } from "@/components/SignInPrompt";
import { type ScreenHeader } from "@/components/nav/ScreenHeader";
import { LoadingState } from "@/components/ui";
import { todayDevotionalDate } from "@shared/devotionals";
import { useConvexAuth, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DevotionalGroupsTab } from "./DevotionalGroupsTab";
import { DevotionalYoursTab } from "./DevotionalYoursTab";

type TabKey = "yours" | "groups";

export const DevotionalsScreen = ({ onBack }: { onBack?: () => void }) => {
  const router = useRouter();
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

  const header: ScreenHeader = {
    title: "Devotionals",
    icon: "book-outline",
    action: {
      label: "Today",
      icon: null,
      onPress: () => router.push(`/devotionals/${today}`),
      accessibilityLabel: "Open today's devotional",
      testID: "devotionals-today",
    },
  };

  const tabs: PagerTab[] = [
    { key: "yours", label: "Yours", render: () => <DevotionalYoursTab /> },
    {
      key: "groups",
      label: "Groups",
      badge: inviteCount > 0 ? inviteCount : undefined,
      render: () => <DevotionalGroupsTab />,
    },
  ];

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={tab}
      onActiveKeyChange={(key) => setTab(key as TabKey)}
      onBack={onBack}
      header={header}
    />
  );
};
