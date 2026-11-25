import { useEffect, useRef } from "react";
import { Animated, type GestureResponderEvent, StyleSheet, View } from "react-native";
import type { PagerCarouselProps } from "@/components/PagerScreen";
import { swipePage } from "@/lib/swipePage";

const touchPoint = (e: GestureResponderEvent) => {
  const touch = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
  return { x: touch.pageX, y: touch.pageY };
};

const scrollsSideways = (start: unknown): boolean => {
  for (let node = start as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
};

export const PagerCarousel = ({ tabs, activeKey, onActiveKeyChange, renderPage, position }: PagerCarouselProps) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const start = useRef<{ x: number; y: number } | null>(null);
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
  return (
    <View
      style={styles.pager}
      onTouchStart={(e) => {
        start.current = scrollsSideways(e.target) ? null : touchPoint(e);
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const to = touchPoint(e);
        const dx = to.x - from.x;
        const sideways = Math.abs(dx) > Math.abs(to.y - from.y) * 1.5;
        const next = sideways ? index + swipePage(dx, 0) : index;
        if (next !== index && tabs[next]) onActiveKeyChange(tabs[next].key);
      }}
    >
      {tab ? renderPage(tab) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  pager: { flex: 1 },
});
