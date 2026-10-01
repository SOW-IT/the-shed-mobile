import { useQuery } from "convex/react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
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
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme, WIDE_SCREEN_MIN_WIDTH } from "@/theme";
import { PagerCarousel } from "@/components/PagerCarousel";
import { FooterHeightContext, TabBar, TopBar } from "@/components/ui";
import { FOOTER_MIN_CLEARANCE, footerClearance } from "@/lib/footerClearance";
import { ScrollByContext } from "@/components/ui/scrollAnchor";
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
  hasTabFooters: boolean,
  hiddenOffset: number
) => {
  if (!hasTabFooters) return 0;
  const dist = Math.abs(pos - homeIndex);
  return Math.min(dist, 1) * hiddenOffset;
};

/**
 * Bottom padding for a self-scrolling tab's own ScrollView, so its last
 * content clears that tab's footer (button plus any note) once measured.
 */
const PagerFooterClearanceContext = createContext(FOOTER_MIN_CLEARANCE);
export const usePagerFooterClearance = () => useContext(PagerFooterClearanceContext);

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

  // Measured height of each tab's footer (button plus any note), so its page
  // pads just enough for the last content to scroll clear of it.
  const [footerHeights, setFooterHeights] = useState<Record<string, number>>({});
  const footerHeightSetters = useRef<Record<string, (height: number) => void>>({});
  const footerHeightSetterFor = (tabKey: string) => {
    if (!footerHeightSetters.current[tabKey]) {
      footerHeightSetters.current[tabKey] = (height) =>
        setFooterHeights((prev) =>
          prev[tabKey] === height ? prev : { ...prev, [tabKey]: height }
        );
    }
    return footerHeightSetters.current[tabKey];
  };
  const footerHeightForPage = (tabKey: string) =>
    footerHeights[footerPinned ? footerItems[0]?.tabKey ?? tabKey : tabKey] ?? 0;
  // Slide a tab's footer far enough down to hide it completely when another
  // tab is showing, however tall it has grown.
  const footerHiddenOffset = Math.max(
    FOOTER_HIDDEN_OFFSET,
    ...Object.values(footerHeights).map((height) => height + spacing.sm)
  );

  const yForFooter = useCallback(
    (pos: number, tabKey: string) =>
      footerYForPosition(
        pos,
        homeIndexFor(tabKey),
        footerItems.length > 0 && !footerPinned,
        footerHiddenOffset
      ),
    [footerItems.length, footerPinned, homeIndexFor, footerHiddenOffset]
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

  const pageScrollRefs = useRef<Record<string, ScrollView | null>>({});
  const scrollByForTab = useRef<Record<string, (dy: number) => void>>({});
  const scrollByFor = (tabKey: string) => {
    if (!scrollByForTab.current[tabKey]) {
      scrollByForTab.current[tabKey] = (dy) =>
        pageScrollRefs.current[tabKey]?.scrollTo({
          y: Math.max(0, (lastScrollYByTab.current[tabKey] ?? 0) + dy),
          animated: false,
        });
    }
    return scrollByForTab.current[tabKey];
  };

  const renderPage = (tab: PagerTab) => {
    const tabScrollProps = scrollPropsForTab(tab.key);
    return (
      tab.selfScrolling ? (
        <PagerFooterClearanceContext.Provider
          value={
            footerTabKeys.has(tab.key)
              ? footerClearance(footerHeightForPage(tab.key))
              : FOOTER_MIN_CLEARANCE
          }
        >
          {tab.render(tabScrollProps)}
        </PagerFooterClearanceContext.Provider>
      ) : (
        <Animated.ScrollView
          ref={(el: ScrollView | null) => {
            pageScrollRefs.current[tab.key] = el;
          }}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: t.background }}
          contentContainerStyle={[
            styles.page,
            fullWidth && wide && { maxWidth: "100%" as const },
            {
              paddingBottom: footerTabKeys.has(tab.key)
                ? footerClearance(footerHeightForPage(tab.key))
                : 48,
            },
          ]}
          {...tabScrollProps}
        >
          <ScrollByContext.Provider value={scrollByFor(tab.key)}>
            {tab.render(tabScrollProps)}
          </ScrollByContext.Provider>
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
            <FooterHeightContext.Provider value={footerHeightSetterFor(item.tabKey)}>
              {item.node}
            </FooterHeightContext.Provider>
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
