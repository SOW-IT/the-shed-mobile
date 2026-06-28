import { useQuery } from "convex/react";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
  /**
   * Render the tab's own scroll container instead of wrapping {@link render} in
   * the shared page ScrollView. Needed when the tab requires `stickyHeaderIndices`
   * (sticky search bars): those indices only target a ScrollView's *direct*
   * children, so the elements must live in a ScrollView the tab owns. Use the
   * exported {@link PAGER_PAGE_CONTENT} style + bottom-inset constants so the
   * page metrics match the shared container.
   */
  selfScrolling?: boolean;
};

/** How close to the bottom (px) before onEndReached fires. */
const NEAR_BOTTOM = 600;

/**
 * How far (px) to lower the footer to clear the screen as the swipe leaves its
 * tab. The footer pill is ~54px tall sitting ~12px above the bottom bar, so this
 * carries it (and its shadow) fully behind the opaque bottom tab bar.
 */
const FOOTER_HIDDEN_OFFSET = 120;

/** How quickly the footer snaps into place after a swipe is released. */
const FOOTER_SETTLE_MS = 140;

export type PagerScrollState = "idle" | "dragging" | "settling";

export type PagerTabFooter = {
  tabKey: string;
  node: ReactNode;
};

const footerYForPosition = (
  pos: number,
  homeIndex: number,
  hasTabFooters: boolean
) => {
  if (!hasTabFooters) return 0;
  const dist = Math.abs(pos - homeIndex);
  return Math.min(dist, 1) * FOOTER_HIDDEN_OFFSET;
};

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
  footers,
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
  /** One sliding footer per tab (e.g. Create event + Create member). */
  footers?: PagerTabFooter[];
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
  const footerAnimsRef = useRef<Record<string, Animated.Value>>({});
  const footerScrollState = useRef<PagerScrollState>("idle");

  const footerPinned = !!(footer && !footerTabKey && !(footers?.length));

  const footerItems: PagerTabFooter[] = useMemo(() => {
    if (footers && footers.length > 0) return footers;
    if (footer && footerTabKey) return [{ tabKey: footerTabKey, node: footer }];
    if (footer) return [{ tabKey: tabs[0]?.key ?? "_pinned", node: footer }];
    return [];
  }, [footers, footer, footerTabKey, tabs]);

  const footerTabKeys = useMemo(
    () =>
      footerPinned
        ? new Set(tabs.map((tab) => tab.key))
        : new Set(footerItems.map((item) => item.tabKey)),
    [footerPinned, footerItems, tabs]
  );

  const activeIndex = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );

  const homeIndexFor = useCallback(
    (tabKey: string) => Math.max(tabs.findIndex((tab) => tab.key === tabKey), 0),
    [tabs]
  );

  const yForFooter = useCallback(
    (pos: number, tabKey: string) =>
      footerYForPosition(
        pos,
        homeIndexFor(tabKey),
        footerItems.length > 0 && !footerPinned
      ),
    [footerItems.length, footerPinned, homeIndexFor]
  );

  const ensureFooterAnim = useCallback(
    (tabKey: string, initialY: number) => {
      if (!footerAnimsRef.current[tabKey]) {
        footerAnimsRef.current[tabKey] = new Animated.Value(initialY);
      }
      return footerAnimsRef.current[tabKey];
    },
    []
  );

  const setAllFooterPositions = useCallback(
    (pos: number, animate: boolean) => {
      for (const item of footerItems) {
        const y = yForFooter(pos, item.tabKey);
        const anim = ensureFooterAnim(item.tabKey, y);
        if (animate) {
          Animated.timing(anim, {
            toValue: y,
            duration: FOOTER_SETTLE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        } else {
          anim.setValue(y);
        }
      }
    },
    [ensureFooterAnim, footerItems, yForFooter]
  );

  // Tab taps and web tab changes — no native pager bounce to follow.
  useEffect(() => {
    if (footerItems.length === 0) return;
    if (footerScrollState.current === "dragging") return;
    setAllFooterPositions(activeIndex, true);
  }, [activeIndex, footerItems.length, setAllFooterPositions]);

  // Track the pager continuously while the finger is down AND through the
  // release deceleration ("settling"), so the footer slides in lockstep with the
  // page the whole way. Tracking only during "dragging" left the footer frozen
  // at the release position on a fast swipe, then jumping to its end-state once
  // the pager reached idle — the catch-up glitch on a quick page change.
  useEffect(() => {
    if (footerItems.length === 0 || Platform.OS === "web") return;
    const id = pagerPosition.addListener(({ value }) => {
      if (footerScrollState.current === "idle") return;
      setAllFooterPositions(value, false);
    });
    return () => pagerPosition.removeListener(id);
  }, [footerItems.length, pagerPosition, setAllFooterPositions]);

  const onPagerScrollStateChange = useCallback(
    (state: PagerScrollState, scrollPos: number, settledIndex?: number) => {
      if (footerItems.length === 0) return;
      footerScrollState.current = state;
      if (state === "dragging") {
        setAllFooterPositions(scrollPos, false);
      } else if (state === "idle" && settledIndex !== undefined) {
        setAllFooterPositions(settledIndex, true);
      }
    },
    [footerItems.length, setAllFooterPositions]
  );
  // The content height each tab last fired onEndReached at, so we don't re-fire
  // on every scroll event while the user lingers near the bottom — only once the
  // page has grown (i.e. more content actually loaded).
  const lastEndReachedHeight = useRef<Record<string, number>>({});

  const renderPage = (tab: PagerTab) =>
    // A self-scrolling tab owns its ScrollView (so it can use stickyHeaderIndices
    // on its own direct children); render it as-is.
    tab.selfScrolling ? (
      tab.render()
    ) : (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[
        styles.page,
        // Only the footer's own tab needs the taller bottom inset; the others
        // (where the footer is slid away) keep the slimmer one. A footer with no
        // footerTabKey is pinned on every tab, so all pages get the inset.
        {
          paddingBottom: footerTabKeys.has(tab.key) ? 96 : 48,
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
        onScrollStateChange={onPagerScrollStateChange}
      />
      {/* eslint-disable react-hooks/refs -- lazy Animated.Value cache (BankTab pattern) */}
      {footerItems.map((item) => {
        const anim = ensureFooterAnim(item.tabKey, yForFooter(activeIndex, item.tabKey));
        return (
          <Animated.View
            key={item.tabKey}
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ translateY: anim }] },
            ]}
          >
            {item.node}
          </Animated.View>
        );
      })}
      {/* eslint-enable react-hooks/refs */}
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

/**
 * `contentContainerStyle` for a self-scrolling tab's own ScrollView, so its page
 * metrics (padding, gap, max width, centering) match the shared container.
 */
export const PAGER_PAGE_CONTENT = styles.page;
/** Bottom inset for a self-scrolling tab without a footer pill. */
export const PAGER_PAGE_BOTTOM_INSET = 48;
/** Bottom inset for a self-scrolling tab that has a footer pill. */
export const PAGER_PAGE_BOTTOM_INSET_WITH_FOOTER = 96;
