import { useQuery } from "convex/react";
import { ReactNode } from "react";
import {
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
  floating,
}: {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  /** Fired with a page's key when it scrolls near its bottom (infinite load). */
  onEndReached?: (key: string) => void;
  /** Pinned full-width action above the bottom bar (e.g. Make Request). */
  footer?: ReactNode;
  /** Absolutely-positioned overlays (e.g. the year picker). */
  floating?: ReactNode;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  // Extra bottom space so the floating footer doesn't cover the last row.
  const bottomPad = footer ? 96 : 48;

  const renderPage = (tab: PagerTab) => {
    const onScroll = onEndReached
      ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (
            contentSize.height - (contentOffset.y + layoutMeasurement.height) <
            NEAR_BOTTOM
          ) {
            onEndReached(tab.key);
          }
        }
      : undefined;
    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[styles.page, { paddingBottom: bottomPad }]}
        scrollEventThrottle={onEndReached ? 16 : undefined}
        onScroll={onScroll}
      >
        {tab.render()}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <View style={styles.chrome}>
        <View style={styles.topBarWrap}>
          <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
        </View>
        <TabBar segments={tabs} active={activeKey} onChange={onActiveKeyChange} />
      </View>
      <PagerCarousel
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={onActiveKeyChange}
        renderPage={renderPage}
      />
      {footer}
      {floating}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  chrome: { width: "100%", maxWidth: 720, alignSelf: "center" },
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
