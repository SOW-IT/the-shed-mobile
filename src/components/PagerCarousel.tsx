import { ReactNode, useEffect } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { PagerScrollState, PagerTab } from "@/components/PagerScreen";

type Props = {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  renderPage: (tab: PagerTab) => ReactNode;
  position?: Animated.Value;
  onScrollStateChange?: (
    state: PagerScrollState,
    scrollPos: number,
    settledIndex?: number
  ) => void;
};

export const PagerCarousel = ({ tabs, activeKey, renderPage, position }: Props) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  useEffect(() => {
    if (!position) return;
    const animation = Animated.timing(position, {
      toValue: index,
      duration: 220,
      useNativeDriver: false,
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
