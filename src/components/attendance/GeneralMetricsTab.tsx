import { useState } from "react";
import { LayoutChangeEvent, useWindowDimensions, View } from "react-native";
import { type ViewBlock } from "../../../shared/attendanceMetricsView";
import { InsightsBlocks } from "@/components/attendance/InsightsBlocks";
import { LoadingState } from "@/components/ui";
import { spacing } from "@/theme";

// The layout comes from `generalMetrics.view` (see InsightsBlocks); the Insights
// screen runs that query so the scope picker can share its year list.
export function GeneralMetricsTab({ view }: { view: { blocks: ViewBlock[] } | undefined }) {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(windowWidth);
  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  if (view === undefined) return <LoadingState />;
  return (
    <View onLayout={onLayout} style={{ gap: spacing.md }}>
      <InsightsBlocks blocks={view.blocks} width={containerWidth} />
      <View style={{ height: 96 }} />
    </View>
  );
}
