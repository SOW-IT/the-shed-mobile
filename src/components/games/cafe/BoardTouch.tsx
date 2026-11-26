import { useEffect, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureTouchEvent } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";

type Props = {
  enabled: boolean;
  pick: (x: number, y: number) => number | null;
  onMove: (move: number) => void;
  preview: (move: number) => ReactNode;
  style: StyleProp<ViewStyle>;
  testID: string;
  children: ReactNode;
};

const touchOf = (event: GestureTouchEvent, id: number | null, list: "allTouches" | "changedTouches") => event[list].find((touch) => touch.id === id) ?? null;

export const BoardTouch = ({ enabled, pick, onMove, preview, style, testID, children }: Props) => {
  const [hover, setHover] = useState<number | null>(null);
  const finger = useSharedValue<number | null>(null);
  useEffect(() => {
    if (!enabled) finger.set(null);
  }, [enabled, finger]);
  const show = (x: number, y: number) => setHover(pick(x, y));
  const lift = () => {
    finger.set(null);
    setHover(null);
  };
  const press = Gesture.Manual()
    .runOnJS(true)
    .enabled(enabled)
    .onTouchesDown((event, manager) => {
      if (finger.get() !== null && event.numberOfTouches > 1) return;
      const touch = event.changedTouches[0];
      finger.set(touch.id);
      manager.activate();
      show(touch.x, touch.y);
    })
    .onTouchesMove((event) => {
      const touch = touchOf(event, finger.get(), "allTouches");
      if (touch) show(touch.x, touch.y);
    })
    .onTouchesUp((event, manager) => {
      const touch = touchOf(event, finger.get(), "changedTouches");
      if (!touch) return;
      const move = pick(touch.x, touch.y);
      lift();
      manager.end();
      if (move !== null) onMove(move);
    })
    .onTouchesCancelled((_event, manager) => {
      lift();
      manager.fail();
    })
    .onFinalize(() => setHover(null));
  const point = Gesture.Hover()
    .runOnJS(true)
    .enabled(enabled)
    .onBegin((event) => {
      if (finger.get() === null) show(event.x, event.y);
    })
    .onUpdate((event) => {
      if (finger.get() === null) show(event.x, event.y);
    })
    .onFinalize(() => {
      if (finger.get() === null) setHover(null);
    });
  return (
    <GestureDetector gesture={Gesture.Simultaneous(press, point)} touchAction={enabled ? "none" : "auto"}>
      <View style={style} pointerEvents={enabled ? "box-only" : "auto"} testID={testID}>
        {children}
        {enabled && hover !== null ? <View pointerEvents="none" style={OVERLAY} testID={`${testID}-preview`}>{preview(hover)}</View> : null}
      </View>
    </GestureDetector>
  );
};

const OVERLAY: ViewStyle = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 };
