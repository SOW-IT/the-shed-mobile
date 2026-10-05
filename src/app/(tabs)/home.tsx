import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { api } from "../../../convex/_generated/api";
import { DEFAULT_HOME_BLOCKS, HOME_TABS } from "../../../shared/homeContent";
import { HomeBlocks } from "@/components/home/HomeBlocks";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { radius, spacing, typography, useAppTheme } from "@/theme";

// Until the server answers, show the built-in content rather than a spinner.
const FALLBACK_TABS = HOME_TABS.map(({ key, label }) => ({
  key,
  label,
  blocks: DEFAULT_HOME_BLOCKS[key],
}));

export default function HomeScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const view = useQuery(api.homeContent.view);
  const [active, setActive] = useState<string>("home");

  const tabs: PagerTab[] = (view?.tabs ?? FALLBACK_TABS).map((tab) => ({
    key: tab.key,
    label: tab.label,
    render: () => <HomeBlocks blocks={tab.blocks} />,
  }));
  const activeKey = tabs.some((tab) => tab.key === active) ? active : tabs[0].key;
  const activeLabel = tabs.find((tab) => tab.key === activeKey)?.label ?? "";

  const floating = view?.canEdit ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${activeLabel}`}
      onPress={() => router.push({ pathname: "/edit-home", params: { tab: activeKey } })}
      style={({ pressed }) => [
        styles.fab,
        t.shadowCard,
        { backgroundColor: t.primary, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="create-outline" size={16} color={t.onPrimary} />
      <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>Edit</Text>
    </Pressable>
  ) : null;

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={activeKey}
      onActiveKeyChange={setActive}
      floating={floating}
    />
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.full,
    zIndex: 20,
  },
});
