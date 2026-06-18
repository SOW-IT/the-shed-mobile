import { ReactNode, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import PagerView from "react-native-pager-view";
import type { PagerTab } from "@/components/PagerScreen";

type Props = {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  renderPage: (tab: PagerTab) => ReactNode;
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
}: Props) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const pagerRef = useRef<PagerView>(null);
  const position = useRef(index);
  const programmatic = useRef(false);
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
      onPageSelected={(e) => {
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
