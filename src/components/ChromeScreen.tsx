import { useQuery } from "convex/react";
import { ReactNode } from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme, WIDE_SCREEN_MIN_WIDTH } from "@/theme";
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
  fullWidth = false,
}: {
  children?: ReactNode;
  /** Pinned full-width area above the bottom bar (e.g. an action pill). */
  footer?: ReactNode;
  /** Absolutely-positioned overlays over the whole screen (e.g. year picker). */
  floating?: ReactNode;
  /**
   * Drop the 720pt reading-width cap so content spans the screen — for wide,
   * multi-column layouts (e.g. the Org chart's per-division column grids). Off
   * by default; most screens keep the cap for readability.
   */
  fullWidth?: boolean;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const insets = useSafeAreaInsets();
  const { collapseStyle, barOpacityStyle, scrollProps } = useTopBarCollapse();
  // Only lift the reading cap once there's genuinely a wide screen; below the
  // breakpoint the window is already narrower than the cap, so it's a no-op.
  const wide = useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;
  return (
    // A plain View, not SafeAreaView: SafeAreaView applies its inset natively,
    // outside Yoga's layout tree, so the absolutely-positioned topBarClip below
    // never sees it and renders under the status bar. Insets are applied by hand
    // instead, to both the clip and the scroll content.
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      {/* The body is full-height and fixed; its content rests below the bar (via
          the scroll inset) and scrolls *under* the floating bar. Collapsing the
          bar therefore reveals more content without shifting the body. Must be an
          Animated.ScrollView so the native-driven collapse can attach to it. */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        style={[styles.body, { backgroundColor: t.background }]}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: spacing.xs + TOP_BAR_HEIGHT + insets.top },
          // `maxWidth: "100%"` (not undefined — RN Web keeps the base 720 when a
          // later value is undefined) lifts the reading cap to the full width.
          fullWidth && wide && { maxWidth: "100%" as const },
        ]}
        {...scrollProps}
      >
        {children}
      </Animated.ScrollView>
      {/* Static clip pinned to the top: the bar slides up *within* it and is
          clipped at the screen edge rather than bleeding into the status bar. */}
      <View
        style={[styles.topBarClip, { height: TOP_BAR_HEIGHT + insets.top }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.topBarWrap,
            { backgroundColor: t.background, paddingTop: insets.top },
            collapseStyle,
          ]}
        >
          <Animated.View style={barOpacityStyle}>
            <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
          </Animated.View>
        </Animated.View>
      </View>
      {footer}
      {floating}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Full-height fixed body: it spans the whole screen and the bar floats over it.
  body: { flex: 1 },
  // Static clip pinned over the body: the collapsing bar slides up within it and
  // is masked at the top edge instead of bleeding into the status-bar inset.
  topBarClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    overflow: "hidden",
    zIndex: 10,
  },
  // Full-width top bar so it spans the screen like the bottom tab bar; the
  // scrolling content below stays capped at 720 + centered. Slides up (under the
  // clip) as the body scrolls, revealing more content without shifting the body.
  topBarWrap: {
    width: "100%",
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    // paddingTop (clearing the floating top bar + the safe-area inset) is
    // applied inline above, since the inset isn't known statically.
    paddingBottom: 48,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});
