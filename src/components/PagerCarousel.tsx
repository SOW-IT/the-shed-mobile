import { ReactNode, useEffect } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { PagerTab } from "@/components/PagerScreen";

type Props = {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  renderPage: (tab: PagerTab) => ReactNode;
  /** Fractional page position; animated to the active tab on change. */
  position?: Animated.Value;
};

/**
 * Web carousel. react-native-pager-view imports native-only modules that can't
 * bundle on web, so on web we render only the active page; tabs are switched via
 * the tab bar rather than by swiping. The native variant lives in
 * PagerCarousel.native.tsx.
 */
export const PagerCarousel = ({ tabs, activeKey, renderPage, position }: Props) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  // No swipe on web, so slide the tab-bar underline to the active tab here.
  useEffect(() => {
    if (!position) return;
    const animation = Animated.timing(position, {
      toValue: index,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, position]);
  const tab = tabs[index] ?? tabs[0];
  return <View style={styles.pager}>{tab ? renderPage(tab) : null}</View>;
};

const styles = StyleSheet.create({
  pager: { flex: 1 },
});
