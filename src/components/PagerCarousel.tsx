import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { PagerTab } from "@/components/PagerScreen";

type Props = {
  tabs: PagerTab[];
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
  renderPage: (tab: PagerTab) => ReactNode;
};

/**
 * Web carousel. react-native-pager-view imports native-only modules that can't
 * bundle on web, so on web we render only the active page; tabs are switched via
 * the tab bar rather than by swiping. The native variant lives in
 * PagerCarousel.native.tsx.
 */
export const PagerCarousel = ({ tabs, activeKey, renderPage }: Props) => {
  const index = Math.max(
    tabs.findIndex((tab) => tab.key === activeKey),
    0
  );
  const tab = tabs[index] ?? tabs[0];
  return <View style={styles.pager}>{tab ? renderPage(tab) : null}</View>;
};

const styles = StyleSheet.create({
  pager: { flex: 1 },
});
