import { ReactNode, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";
import type { PagerScrollState, PagerTab } from "@/components/PagerScreen";

type Props = {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  renderPage: (tab: PagerTab) => ReactNode;
  /** Fractional page position, updated live as the pager scrolls. */
  position?: Animated.Value;
  onScrollStateChange?: (
    state: PagerScrollState,
    scrollPos: number,
    settledIndex?: number
  ) => void;
};

/**
 * Native carousel: a real PagerView kept in sync with `activeKey` both ways — a
 * swipe updates the key, and a key change (tab tap / deep link) animates the
 * pager. It tracks the pager's real position to skip a redundant setPage after a
 * swipe, and guards the programmatic setPage from echoing back through
 * onPageSelected.
 */
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
  // The previous scroll state, so we only settle the underline on a real
  // settling→idle transition (gesture released + animated to rest) rather than
  // any "idle" — pager-view also emits idle mid-drag (a slow drag pausing on a
  // page boundary with the finger still down), and snapping there is the flicker.
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
      // Feed the live scroll position (page + 0..1 offset) to the tab bar so
      // its underline follows the swipe.
      onPageScroll={(e: { nativeEvent: { position: number; offset: number } }) => {
        const value = e.nativeEvent.position + e.nativeEvent.offset;
        lastScroll.current = value;
        scrollPosition?.setValue(value);
      }}
      // Settle the underline exactly on the landed page (a final onPageScroll can
      // stop a hair short of the integer) — but ONLY on a settling→idle
      // transition, i.e. after the finger lifts and the pager animates to rest.
      // A bare "idle" also fires mid-drag (a slow drag pausing on a boundary with
      // the finger still down); snapping to the integer there jumps the underline
      // to its end-state for a frame before the next onPageScroll flicks it back
      // to the live offset — the back-and-forth flicker.
      onPageScrollStateChanged={(e: { nativeEvent: { pageScrollState: string } }) => {
        const state = e.nativeEvent.pageScrollState as PagerScrollState;
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
