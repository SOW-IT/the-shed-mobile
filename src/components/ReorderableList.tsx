import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { spacing, USE_NATIVE_DRIVER, useAppTheme } from "@/theme";

type Measurable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void
  ) => void;
  getBoundingClientRect?: () => { top: number };
};

const measureY = (node: Measurable, callback: (y: number | null) => void) => {
  if (Platform.OS === "web") {
    const rect = node.getBoundingClientRect?.();
    callback(rect ? rect.top : null);
  } else if (node.measureInWindow) {
    node.measureInWindow((_x, y) => callback(y));
  } else {
    callback(null);
  }
};

export type ReorderableRenderContext = {
  /** Grip handle — place at the start of each row header. */
  dragHandle: ReactNode;
  dragging: boolean;
};

type ReorderableListProps<T> = {
  items: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (items: T[]) => void;
  renderItem: (
    item: T,
    index: number,
    ctx: ReorderableRenderContext
  ) => ReactNode;
  gap?: number;
  reorderEnabled?: boolean;
};

const getTargetIndex = (
  from: number,
  deltaY: number,
  heights: number[],
  gap: number
): number => {
  if (heights.length === 0) return from;
  let center = 0;
  for (let i = 0; i < from; i++) center += (heights[i] ?? 0) + gap;
  center += (heights[from] ?? 0) / 2 + deltaY;

  let acc = 0;
  for (let i = 0; i < heights.length; i++) {
    const itemCenter = acc + (heights[i] ?? 0) / 2;
    if (center <= itemCenter) return i;
    acc += (heights[i] ?? 0) + gap;
  }
  return heights.length - 1;
};

function ReorderableRow({
  id,
  index,
  disabled,
  gap,
  heightsRef,
  onDragStart,
  onDragEnd,
  onMove,
  registerCard,
  flipTranslateY,
  children,
}: {
  id: string;
  index: number;
  disabled: boolean;
  gap: number;
  heightsRef: React.MutableRefObject<number[]>;
  onDragStart: (id: string, index: number) => void;
  onDragEnd: () => void;
  onMove: (from: number, to: number) => void;
  registerCard: (id: string, node: Measurable | null) => void;
  flipTranslateY: Animated.Value;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const t = useAppTheme();
  const dragY = useSharedValue(0);
  const dragging = useSharedValue(false);

  /* eslint-disable react-hooks/refs -- heightsRef read in pan gesture handler */
  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetY([-6, 6])
    .onStart(() => {
      dragging.value = true;
      runOnJS(onDragStart)(id, index);
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
    })
    .onEnd((e) => {
      dragging.value = false;
      const target = getTargetIndex(
        index,
        e.translationY,
        heightsRef.current,
        gap
      );
      if (target !== index) runOnJS(onMove)(index, target);
      dragY.value = withTiming(0, { duration: 180 });
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      dragging.value = false;
      dragY.value = withTiming(0, { duration: 180 });
      runOnJS(onDragEnd)();
    });
  /* eslint-enable react-hooks/refs */

  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    zIndex: dragging.value ? 10 : 0,
    elevation: dragging.value ? 6 : 0,
  }));

  const handle = (
    <GestureDetector gesture={pan}>
      <Reanimated.View
        accessibilityRole="button"
        accessibilityLabel="Drag to reorder"
        style={styles.handle}
        hitSlop={8}
      >
        <Ionicons name="reorder-three" size={22} color={t.muted} />
      </Reanimated.View>
    </GestureDetector>
  );

  return (
    <View
      ref={(node) => registerCard(id, node as unknown as Measurable | null)}
      collapsable={false}
      onLayout={(e: LayoutChangeEvent) => {
        heightsRef.current[index] = e.nativeEvent.layout.height;
      }}
      style={{ marginBottom: gap }}
    >
      <Animated.View style={{ transform: [{ translateY: flipTranslateY }] }}>
        <Reanimated.View style={dragStyle}>
          {children(handle)}
        </Reanimated.View>
      </Animated.View>
    </View>
  );
}

/** Vertical drag-to-reorder list with FLIP settle animation (Bank-tab style). */
export function ReorderableList<T>({
  items,
  keyExtractor,
  onReorder,
  renderItem,
  gap = spacing.sm,
  reorderEnabled = true,
}: ReorderableListProps<T>) {
  const cardRefs = useRef(new Map<string, Measurable>());
  const translateYs = useRef(new Map<string, Animated.Value>());
  const prevPositions = useRef(new Map<string, number>());
  const heightsRef = useRef<number[]>([]);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const orderKey = items.map((item, i) => keyExtractor(item, i)).join("|");

  const getTranslateY = (id: string) => {
    let value = translateYs.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      translateYs.current.set(id, value);
    }
    return value;
  };

  const registerCard = (id: string, node: Measurable | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  };

  useLayoutEffect(() => {
    if (draggingKey) return;
    const ids = items.map((item, i) => keyExtractor(item, i));
    if (ids.length === 0) {
      prevPositions.current.clear();
      return;
    }
    const nextPositions = new Map<string, number>();
    let remaining = ids.length;
    const finish = () => {
      for (const id of ids) {
        const oldY = prevPositions.current.get(id);
        const newY = nextPositions.get(id);
        if (oldY != null && newY != null && Math.abs(oldY - newY) > 0.5) {
          const ty = getTranslateY(id);
          ty.setValue(oldY - newY);
          Animated.timing(ty, {
            toValue: 0,
            duration: 340,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        }
      }
      prevPositions.current.clear();
      nextPositions.forEach((y, id) => prevPositions.current.set(id, y));
    };
    for (const id of ids) {
      const node = cardRefs.current.get(id);
      if (!node) {
        if (--remaining === 0) finish();
        continue;
      }
      measureY(node, (y) => {
        if (y != null) nextPositions.set(id, y);
        if (--remaining === 0) finish();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, draggingKey]);

  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    onReorder(next);
  };

  return (
    <View>
      {/* eslint-disable react-hooks/refs -- lazy Animated.Value cache per row */}
      {items.map((item, index) => {
        const id = keyExtractor(item, index);
        return (
          <ReorderableRow
            key={id}
            id={id}
            index={index}
            disabled={
              !reorderEnabled || (draggingKey !== null && draggingKey !== id)
            }
            gap={gap}
            heightsRef={heightsRef}
            onDragStart={(key) => setDraggingKey(key)}
            onDragEnd={() => setDraggingKey(null)}
            onMove={moveItem}
            registerCard={registerCard}
            flipTranslateY={getTranslateY(id)}
          >
            {(dragHandle) =>
              renderItem(item, index, {
                dragHandle,
                dragging: draggingKey === id,
              })
            }
          </ReorderableRow>
        );
      })}
      {/* eslint-enable react-hooks/refs */}
    </View>
  );
}

const styles = StyleSheet.create({
  handle: {
    paddingVertical: 4,
    paddingRight: spacing.sm,
    justifyContent: "center",
  },
});
