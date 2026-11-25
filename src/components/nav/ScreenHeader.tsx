import { AppIcon, type AppIconName } from "@/components/ui/icon";
import { useWideLayout } from "@/components/nav/layout";
import { headerPlacement, type ScreenHeader as ScreenHeaderSpec } from "@/lib/screenHeader";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ScreenHeader = ScreenHeaderSpec<AppIconName>;

const HeaderActions = ({ header }: { header: ScreenHeader }) => {
  const t = useAppTheme();
  const { action, info } = header;
  if (!action && !info) return null;
  return (
    <View style={styles.actions}>
      {info ? (
        <Pressable
          onPress={info.onPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={info.accessibilityLabel}
          testID="screen-header-info"
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Ionicons name="information-circle-outline" size={24} color={t.text} />
        </Pressable>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          accessibilityState={{ disabled: !!action.disabled }}
          testID={action.testID ?? "screen-header-action"}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: t.primary },
            action.disabled && styles.disabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          {action.icon === null ? null : <AppIcon name={action.icon ?? "add"} size={16} color={t.onPrimary} />}
          <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
      <HeaderActions header={header} />
    </View>
  );
};

export const useScreenHeader = (header: ScreenHeader | undefined) => {
  const { topBar, page } = headerPlacement(useWideLayout(), header);
  return {
    topBarTitle: topBar ? <TopBarTitle title={topBar.title} /> : undefined,
    topBarRight: topBar ? <HeaderActions header={topBar} /> : undefined,
    pageHeader: page ? <PageHeader header={page} /> : null,
  };
};

const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
  },
  disabled: { opacity: 0.45 },
  page: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pageTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
});
