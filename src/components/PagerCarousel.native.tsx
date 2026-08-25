import { ReactNode, useEffect, useRef } from "react";
import { Animated, Keyboard, StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";
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

export const PagerCarousel = ({
  tabs,
  activeKey,
  onActiveKeyChange,
  renderPage,
  position: scrollPosition,
  onScrollStateChange,
}: Props) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const pagerRef = useRef<PagerView>(null);
  const position = useRef(index);
  const programmatic = useRef(false);
  const scrollState = useRef<string>("idle");
  const lastScroll = useRef(index);
  useEffect(() => {
    if (position.current === index) return;
    programmatic.current = true;
    position.current = index;
    pagerRef.current?.setPage(index);
  }, [index]);
  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={index}
      onPageScroll={(e: { nativeEvent: { position: number; offset: number } }) => {
        const value = e.nativeEvent.position + e.nativeEvent.offset;
        lastScroll.current = value;
        scrollPosition?.setValue(value);
      }}
      onPageScrollStateChanged={(e: { nativeEvent: { pageScrollState: string } }) => {
        const state = e.nativeEvent.pageScrollState as PagerScrollState;
        if (state === "dragging") Keyboard.dismiss();
        if (state === "idle" && scrollState.current === "settling") {
          scrollPosition?.setValue(position.current);
          onScrollStateChange?.("idle", lastScroll.current, position.current);
        } else if (state === "dragging" || state === "settling") {
          onScrollStateChange?.(state, lastScroll.current);
        }
        scrollState.current = state;
      }}
      onPageSelected={(e: { nativeEvent: { position: number } }) => {
        position.current = e.nativeEvent.position;
        if (programmatic.current) {
          programmatic.current = false;
          return;
        }
        const next = tabs[e.nativeEvent.position];
        if (next) onActiveKeyChange(next.key);
      }}
    >
      {tabs.map((tab) => (
        <View key={tab.key} style={styles.pagerPage}>
          {renderPage(tab)}
        </View>
      ))}
    </PagerView>
  );
};

const styles = StyleSheet.create({
  pager: { flex: 1 },
  pagerPage: { flex: 1 },
});
