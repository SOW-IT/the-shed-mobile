import { useEffect } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { PagerCarouselProps } from "@/components/PagerScreen";

export const PagerCarousel = ({ tabs, activeKey, renderPage, position }: PagerCarouselProps) => {
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
