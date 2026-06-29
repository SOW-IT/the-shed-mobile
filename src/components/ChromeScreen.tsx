import { useQuery } from "convex/react";
import { ReactNode } from "react";
import { Animated, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme } from "@/theme";
import { TopBar } from "@/components/ui";
import { TOP_BAR_HEIGHT, useTopBarCollapse } from "@/components/useTopBarCollapse";

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
      {/* The body is full-height and fixed; its content rests below the bar (via
          the scroll inset) and scrolls *under* the floating bar. Collapsing the
          bar therefore reveals more content without shifting the body. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={[styles.body, { backgroundColor: t.background }]}
        contentContainerStyle={styles.scroll}
        {...scrollProps}
      >
        {children}
      </ScrollView>
      <Animated.View
        style={[styles.topBarWrap, { backgroundColor: t.background }, topBarStyle]}
      >
        <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
      </Animated.View>
      {footer}
      {floating}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Full-height fixed body: it spans the whole screen and the bar floats over it.
  body: { flex: 1 },
  // Full-width top bar so it spans the screen like the bottom tab bar; the
  // scrolling content below stays capped at 720 + centered. Floated over the
  // body so the body can stay full-height and fixed while the bar collapses.
  topBarWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    paddingHorizontal: spacing.lg,
    zIndex: 10,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    // Clear the floating top bar at rest; content scrolls up under it.
    paddingTop: spacing.xs + TOP_BAR_HEIGHT,
    paddingBottom: 48,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});
