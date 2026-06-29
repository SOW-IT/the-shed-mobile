import { useQuery } from "convex/react";
import { ReactNode } from "react";
import { Animated, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme } from "@/theme";
import { TopBar } from "@/components/ui";
import { useTopBarCollapse } from "@/components/useTopBarCollapse";

/**
 * Page shell for the main, non-tabbed screens (Org): the top chrome — the SOW
 * logo and profile avatar, no page title — pinned above a scrollable content
 * column. Tabbed screens (Requests, Manage) use PagerScreen instead.
 */
export const ChromeScreen = ({
  children,
  footer,
  floating,
}: {
  children?: ReactNode;
  /** Pinned full-width area above the bottom bar (e.g. an action pill). */
  footer?: ReactNode;
  /** Absolutely-positioned overlays over the whole screen (e.g. year picker). */
  floating?: ReactNode;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const { topBarStyle, scrollProps } = useTopBarCollapse();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <Animated.View style={[styles.topBarWrap, topBarStyle]}>
        <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
      </Animated.View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: t.background }}
        contentContainerStyle={styles.scroll}
        {...scrollProps}
      >
        {children}
      </ScrollView>
      {footer}
      {floating}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Full-width top bar so it spans the screen like the bottom tab bar; the
  // scrolling content below stays capped at 720 + centered.
  topBarWrap: {
    width: "100%",
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 48,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});
