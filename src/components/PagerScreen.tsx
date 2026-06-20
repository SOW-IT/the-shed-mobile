import { useQuery } from "convex/react";
import { ReactNode, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme } from "@/theme";
import { PagerCarousel } from "@/components/PagerCarousel";
import { TabBar, TopBar } from "@/components/ui";

export type PagerTab = {
  key: string;
  label: string;
  /** Amber action-required count. */
  badge?: number;
  /** White unread-message count. */
  messageBadge?: number;
  render: () => ReactNode;
};

/** How close to the bottom (px) before onEndReached fires. */
const NEAR_BOTTOM = 600;

/**
 * How far (px) to lower the footer to clear the screen as the swipe leaves its
 * tab. The footer pill is ~54px tall sitting ~12px above the bottom bar, so this
 * carries it (and its shadow) fully behind the opaque bottom tab bar.
 */
const FOOTER_HIDDEN_OFFSET = 120;

/**
 * Page shell for the tabbed main screens (Requests, Manage): the top chrome
 * (logo + avatar) and a full-width square tab bar pinned up top, over a
 * swipeable carousel of pages. Each page scrolls independently.
 *
 * `activeKey` is the single source of truth (owned by the caller). The carousel
 * itself is platform-split — a native `PagerView` (with two-way position sync)
 * on device, and an active-page-only renderer on web, where pager-view pulls in
 * native-only modules.
 */
export const PagerScreen = ({
  tabs,
  activeKey,
  onActiveKeyChange,
  onEndReached,
  footer,
  footerTabKey,
  floating,
}: {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  /** Fired with a page's key when it scrolls near its bottom (infinite load). */
  onEndReached?: (key: string) => void;
  /** Pinned full-width action above the bottom bar (e.g. Make Request). */
  footer?: ReactNode;
  /**
   * The tab the {@link footer} belongs to. When set, the footer is mounted on
   * every page but slides down out of view as the swipe moves away from this
   * tab, and back up on return — tracking the pager continuously. Omit to keep
   * the footer pinned on all tabs.
   */
  footerTabKey?: string;
  /** Absolutely-positioned overlays (e.g. the year picker). */
  floating?: ReactNode;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  // Fractional page position shared with the tab bar so its underline tracks
  // the pager: driven continuously by swipes on native, animated on tab change
  // on web. See PagerCarousel.
  const initialIndex = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const [pagerPosition] = useState(() => new Animated.Value(initialIndex));
  // Home index of the footer's tab — the footer slides away as the pager moves
  // off it (see footerSlide below). Defaults to the first tab when unspecified.
  const footerHomeIndex = footerTabKey
    ? Math.max(
        tabs.findIndex((tab) => tab.key === footerTabKey),
        0
      )
    : 0;
  // Lower the footer off-screen as the swipe leaves its tab (in either
  // direction), and raise it back on return. Clamped so far-away tabs keep it
  // fully hidden. On web this rides the 220ms tab-change animation. With no
  // footerTabKey the footer is pinned, so it never moves.
  const footerSlide = pagerPosition.interpolate({
    inputRange: [footerHomeIndex - 1, footerHomeIndex, footerHomeIndex + 1],
    outputRange: footerTabKey
      ? [FOOTER_HIDDEN_OFFSET, 0, FOOTER_HIDDEN_OFFSET]
      : [0, 0, 0],
    extrapolate: "clamp",
  });
  // The content height each tab last fired onEndReached at, so we don't re-fire
  // on every scroll event while the user lingers near the bottom — only once the
  // page has grown (i.e. more content actually loaded).
  const lastEndReachedHeight = useRef<Record<string, number>>({});

  const renderPage = (tab: PagerTab) => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        styles.page,
        // Only the footer's own tab needs the taller bottom inset; the others
        // (where the footer is slid away) keep the slimmer one. A footer with no
        // footerTabKey is pinned on every tab, so all pages get the inset.
        {
          paddingBottom:
            footer && (!footerTabKey || tab.key === footerTabKey) ? 96 : 48,
        },
      ]}
      scrollEventThrottle={onEndReached ? 16 : undefined}
      onScroll={
        onEndReached
          ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const distanceToBottom =
                contentSize.height - (contentOffset.y + layoutMeasurement.height);
              const lastHeight = lastEndReachedHeight.current[tab.key] ?? -1;
              if (distanceToBottom < NEAR_BOTTOM && contentSize.height > lastHeight) {
                lastEndReachedHeight.current[tab.key] = contentSize.height;
                onEndReached(tab.key);
              }
            }
          : undefined
      }
    >
      {tab.render()}
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <View style={styles.chrome}>
        <View style={styles.topBarWrap}>
          <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
        </View>
        <TabBar
          segments={tabs}
          active={activeKey}
          onChange={onActiveKeyChange}
          position={pagerPosition}
        />
      </View>
      <PagerCarousel
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={onActiveKeyChange}
        renderPage={renderPage}
        position={pagerPosition}
      />
      {footer ? (
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { transform: [{ translateY: footerSlide }] }]}
        >
          {footer}
        </Animated.View>
      ) : null}
      {floating}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Full-width chrome (top bar + sub tab bar) so it spans the screen like the
  // bottom tab bar; the scrolling content below stays capped at 720 + centered.
  chrome: { width: "100%" },
  topBarWrap: { paddingHorizontal: spacing.lg },
  page: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});
