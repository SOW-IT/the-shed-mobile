import { AppIcon, type AppIconName } from "@/components/ui/icon";
import { useWideLayout } from "@/components/nav/layout";
import { headerPlacement, type ScreenHeader as ScreenHeaderSpec } from "@/lib/screenHeader";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ScreenHeader = ScreenHeaderSpec<AppIconName>;

const HeaderAction = ({ header }: { header: ScreenHeader }) => {
  const t = useAppTheme();
  const { action } = header;
  if (!action) return null;
  return (
    <Pressable
      onPress={action.onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      testID={action.testID ?? "screen-header-action"}
      style={({ pressed }) => [styles.action, { backgroundColor: t.primary }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
};

const TopBarTitle = ({ title }: { title: string }) => {
  const t = useAppTheme();
  return (
    <Text style={[typography.headline, { color: t.text }]} numberOfLines={1} accessibilityRole="header" testID="screen-header-title">
      {title}
    </Text>
  );
};

const PageHeader = ({ header }: { header: ScreenHeader }) => {
  const t = useAppTheme();
  return (
    <View style={styles.page} testID="screen-header-page">
      <View style={styles.pageTitle}>
        {header.icon ? <AppIcon name={header.icon} size={26} color={t.primary} /> : null}
        <Text style={[typography.largeTitle, { color: t.text, flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1}>
          {header.title}
        </Text>
      </View>
      <HeaderAction header={header} />
    </View>
  );
};

export const useScreenHeader = (header: ScreenHeader | undefined) => {
  const { topBar, page } = headerPlacement(useWideLayout(), header);
  return {
    topBarTitle: topBar ? <TopBarTitle title={topBar.title} /> : undefined,
    topBarRight: topBar?.action ? <HeaderAction header={topBar} /> : undefined,
    pageHeader: page ? <PageHeader header={page} /> : null,
  };
};

const styles = StyleSheet.create({
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  page: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pageTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
});
