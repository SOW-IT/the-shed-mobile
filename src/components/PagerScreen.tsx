import { useQuery } from "convex/react";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme, WIDE_SCREEN_MIN_WIDTH } from "@/theme";
import { PagerCarousel } from "@/components/PagerCarousel";
import { TabBar, TopBar } from "@/components/ui";
import {
  TOP_BAR_HEIGHT,
  TopBarScrollProps,
  useTopBarCollapse,
} from "@/components/useTopBarCollapse";

export type { TopBarScrollProps } from "@/components/useTopBarCollapse";

export type PagerTab = {
  key: string;
  label: string;
  badge?: number;
  messageBadge?: number;
  render: (scrollProps?: TopBarScrollProps) => ReactNode;
  selfScrolling?: boolean;
};

const NEAR_BOTTOM = 600;

const FOOTER_HIDDEN_OFFSET = 120;

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

export const PagerScreen = ({
  tabs,
  activeKey,
  onActiveKeyChange,
  onEndReached,
  footer,
  footerTabKey,
  footers,
  floating,
  fullWidth = false,
}: {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  onEndReached?: (key: string) => void;
  footer?: ReactNode;
  footerTabKey?: string;
  footers?: PagerTabFooter[];
  floating?: ReactNode;
  fullWidth?: boolean;
}) => {
  const t = useAppTheme();
  const wide = useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;
  const me = useQuery(api.directory.me);
  const insets = useSafeAreaInsets();
  const initialIndex = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const [pagerPosition] = useState(() => new Animated.Value(initialIndex));
  const [tabBarHeight, setTabBarHeight] = useState(48);
  const footerAnimsRef = useRef<Record<string, Animated.Value>>({});
  const footerScrollState = useRef<PagerScrollState>("idle");
  const { collapseStyle, barOpacityStyle, makeScrollHandler, syncToScrollY } =
    useTopBarCollapse();
  const lastScrollYByTab = useRef<Record<string, number>>({});

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

  useEffect(() => {
    syncToScrollY(lastScrollYByTab.current[activeKey] ?? 0);
    if (footerItems.length === 0) return;
    if (footerScrollState.current === "dragging") return;
    setAllFooterPositions(activeIndex, true);
  }, [activeIndex, activeKey, footerItems.length, setAllFooterPositions, syncToScrollY]);

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
  const lastEndReachedHeight = useRef<Record<string, number>>({});
  const onEndReachedRef = useRef(onEndReached);

  useEffect(() => {
    onEndReachedRef.current = onEndReached;
  }, [onEndReached]);

  const scrollSideEffectsRef = useRef(
    (tabKey: string, e: NativeSyntheticEvent<NativeScrollEvent>) => {
      lastScrollYByTab.current[tabKey] = Math.max(0, e.nativeEvent.contentOffset.y);
      const endReached = onEndReachedRef.current;
      if (!endReached) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const lastHeight = lastEndReachedHeight.current[tabKey] ?? -1;
      if (contentSize.height < lastHeight) {
        lastEndReachedHeight.current[tabKey] = -1;
      }
      const distanceToBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      const effectiveLast = lastEndReachedHeight.current[tabKey] ?? -1;
      if (distanceToBottom < NEAR_BOTTOM && contentSize.height > effectiveLast) {
        lastEndReachedHeight.current[tabKey] = contentSize.height;
        endReached(tabKey);
      }
    }
  );

  const scrollHandlersRef = useRef<Record<string, TopBarScrollProps>>({});
  const scrollPropsForTab = useCallback(
    (tabKey: string): TopBarScrollProps => {
      if (!scrollHandlersRef.current[tabKey]) {
        scrollHandlersRef.current[tabKey] = makeScrollHandler((e) =>
          scrollSideEffectsRef.current(tabKey, e)
        );
      }
      return scrollHandlersRef.current[tabKey];
    },
    [makeScrollHandler]
  );

  const renderPage = (tab: PagerTab) => {
    const tabScrollProps = scrollPropsForTab(tab.key);
    return (
      tab.selfScrolling ? (
        tab.render(tabScrollProps)
      ) : (
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: t.background }}
          contentContainerStyle={[
            styles.page,
            fullWidth && wide && { maxWidth: "100%" as const },
            {
              paddingBottom: footerTabKeys.has(tab.key) ? 96 : 48,
            },
          ]}
          {...tabScrollProps}
        >
          {tab.render(tabScrollProps)}
        </Animated.ScrollView>
      )
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <View style={{ height: insets.top + tabBarHeight }} />
      <PagerCarousel
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={onActiveKeyChange}
        renderPage={renderPage}
        position={pagerPosition}
        onScrollStateChange={onPagerScrollStateChange}
      />
      <View style={[styles.chrome, { top: insets.top }]} pointerEvents="box-none">
        <Animated.View
          style={[styles.chromeGroup, { backgroundColor: t.background }, collapseStyle]}
          pointerEvents="box-none"
        >
          <Animated.View style={[styles.topBarWrap, barOpacityStyle]}>
            <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
          </Animated.View>
          <View onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}>
            <TabBar
              segments={tabs}
              active={activeKey}
              onChange={onActiveKeyChange}
              position={pagerPosition}
            />
          </View>
        </Animated.View>
      </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    width: "100%",
    overflow: "hidden",
    zIndex: 10,
  },
  chromeGroup: { width: "100%" },
  topBarWrap: { paddingHorizontal: spacing.lg },
  page: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md + TOP_BAR_HEIGHT,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});

export const PAGER_PAGE_CONTENT = styles.page;
export const PAGER_TOP_BAR_INSET = TOP_BAR_HEIGHT;
export const PAGER_PAGE_BOTTOM_INSET = 48;
export const PAGER_PAGE_BOTTOM_INSET_WITH_FOOTER = 96;
