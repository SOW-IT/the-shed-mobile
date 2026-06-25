import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
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

type DragState = {
  id: string;
  from: number;
  hover: number;
};

/** Slot index for the dragged row's center given a fixed start index and finger delta. */
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

/** Visual shift for non-dragged rows while hovering over a new slot. */
const getPreviewOffset = (
  index: number,
  from: number,
  hover: number,
  draggedHeight: number,
  gap: number
): number => {
  if (from === hover) return 0;
  const shift = draggedHeight + gap;
  if (from < hover) {
    if (index > from && index <= hover) return -shift;
  } else if (index >= hover && index < from) {
    return shift;
  }
  return 0;
};

const reorderItems = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
};

function ReorderableRow({
  id,
  index,
  disabled,
  active,
  gap,
  heightsRef,
  onDragStart,
  onDragMove,
  onDragFinish,
  registerCard,
  flipTranslateY,
  previewTranslateY,
  children,
}: {
  id: string;
  index: number;
  disabled: boolean;
  /** This row is the one being dragged — lift it above its siblings. */
  active: boolean;
  gap: number;
  heightsRef: React.MutableRefObject<Map<string, number>>;
  onDragStart: (id: string, index: number) => void;
  onDragMove: (id: string, deltaY: number) => void;
  onDragFinish: (id: string, deltaY: number) => void;
  registerCard: (id: string, node: Measurable | null) => void;
  flipTranslateY: Animated.Value;
  previewTranslateY: Animated.Value;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const t = useAppTheme();
  const dragY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const finished = useSharedValue(false);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetY([-6, 6])
    .onStart(() => {
      finished.value = false;
      dragging.value = true;
      runOnJS(onDragStart)(id, index);
    })
    .onUpdate((e) => {
      dragY.value = e.translationY;
      runOnJS(onDragMove)(id, e.translationY);
    })
    .onEnd((e) => {
      if (finished.value) return;
      finished.value = true;
      dragging.value = false;
      runOnJS(onDragFinish)(id, e.translationY);
      // Reset instantly — FLIP handles the settle animation from drop position
      dragY.value = 0;
    })
    .onFinalize(() => {
      dragging.value = false;
    });

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
        heightsRef.current.set(id, e.nativeEvent.layout.height);
      }}
      // Lift the dragged row above its siblings so it slides over (not under)
      // the cards it passes. zIndex governs iOS/web stacking; elevation Android.
      style={[{ marginBottom: gap }, active && styles.activeRow]}
    >
      <Animated.View
        style={{
          transform: [
            {
              translateY: Animated.add(flipTranslateY, previewTranslateY),
            },
          ],
        }}
      >
        <Reanimated.View style={dragStyle}>{children(handle)}</Reanimated.View>
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
  const containerRef = useRef<Measurable | null>(null);
  const cardRefs = useRef(new Map<string, Measurable>());
  const translateYs = useRef(new Map<string, Animated.Value>());
  const previewTranslateYs = useRef(new Map<string, Animated.Value>());
  const previewAnimsRef = useRef(new Map<string, Animated.CompositeAnimation>());
  const prevPositions = useRef(new Map<string, number>());
  const heightsRef = useRef(new Map<string, number>());
  const dragStateRef = useRef<DragState | null>(null);
  const dropInfoRef = useRef<{
    id: string;
    deltaY: number;
    previewOffsets: Map<string, number>;
  } | null>(null);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const orderKey = items.map((item, i) => keyExtractor(item, i)).join("|");

  const heightsInOrder = useCallback(
    () =>
      items.map((item, i) => heightsRef.current.get(keyExtractor(item, i)) ?? 0),
    [items, keyExtractor]
  );

  const getTranslateY = (id: string) => {
    let value = translateYs.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      translateYs.current.set(id, value);
    }
    return value;
  };

  const getPreviewTranslateY = (id: string) => {
    let value = previewTranslateYs.current.get(id);
    if (!value) {
      value = new Animated.Value(0);
      previewTranslateYs.current.set(id, value);
    }
    return value;
  };

  const resetPreviewOffsets = useCallback(() => {
    previewAnimsRef.current.forEach((anim) => anim.stop());
    previewAnimsRef.current.clear();
    previewTranslateYs.current.forEach((ty) => ty.setValue(0));
  }, []);

  const registerCard = (id: string, node: Measurable | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  };

  const handleDragStart = useCallback((id: string, index: number) => {
    dragStateRef.current = { id, from: index, hover: index };
    setDraggingKey(id);
    setHoverIndex(index);
  }, []);

  const handleDragMove = useCallback(
    (id: string, deltaY: number) => {
      const drag = dragStateRef.current;
      if (!drag || drag.id !== id) return;
      const target = getTargetIndex(drag.from, deltaY, heightsInOrder(), gap);
      if (target === drag.hover) return;
      dragStateRef.current = { ...drag, hover: target };
      setHoverIndex(target);
    },
    [gap, heightsInOrder]
  );

  const handleDragFinish = useCallback(
    (id: string, deltaY: number) => {
      const drag = dragStateRef.current;
      dragStateRef.current = null;

      // Snapshot preview offsets BEFORE resetting, so FLIP can start from the
      // visual position instead of the card's original slot.
      if (drag && drag.id === id) {
        const draggedHeight = heightsRef.current.get(id) ?? 0;
        const previewOffsets = new Map<string, number>();
        items.forEach((item, index) => {
          const rowId = keyExtractor(item, index);
          if (rowId !== id) {
            previewOffsets.set(
              rowId,
              getPreviewOffset(index, drag.from, drag.hover, draggedHeight, gap)
            );
          }
        });
        dropInfoRef.current = { id, deltaY, previewOffsets };
      }

      setDraggingKey(null);
      setHoverIndex(null);
      resetPreviewOffsets();

      if (!drag || drag.id !== id) return;
      const to = getTargetIndex(drag.from, deltaY, heightsInOrder(), gap);
      if (to !== drag.from) {
        onReorder(reorderItems(items, drag.from, to));
      }
    },
    [gap, heightsInOrder, items, keyExtractor, onReorder, resetPreviewOffsets]
  );

  // Shift non-dragged rows into the hovered slot while dragging (data order stays fixed).
  useLayoutEffect(() => {
    const drag = dragStateRef.current;
    if (!drag || hoverIndex == null) return;

    const draggedHeight = heightsRef.current.get(drag.id) ?? 0;
    items.forEach((item, index) => {
      const rowId = keyExtractor(item, index);
      if (rowId === drag.id) return;
      const offset = getPreviewOffset(
        index,
        drag.from,
        hoverIndex,
        draggedHeight,
        gap
      );
      // Stop any in-flight preview animation before starting a new one.
      previewAnimsRef.current.get(rowId)?.stop();
      const ty = getPreviewTranslateY(rowId);
      const anim = Animated.timing(ty, {
        toValue: offset,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      });
      previewAnimsRef.current.set(rowId, anim);
      anim.start(({ finished: done }) => {
        if (done) previewAnimsRef.current.delete(rowId);
      });
    });
  }, [gap, hoverIndex, items, keyExtractor]);

  // FLIP settle after a committed reorder (not during drag).
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
      // Consume drop info so we adjust FLIP start positions from the visual
      // position where the user released (not the card's original slot).
      const dropInfo = dropInfoRef.current;
      dropInfoRef.current = null;

      for (const id of ids) {
        const oldY = prevPositions.current.get(id);
        const newY = nextPositions.get(id);
        if (oldY == null || newY == null) continue;

        // Adjust starting position to where the card visually was at drop.
        let startY = oldY;
        if (dropInfo) {
          if (id === dropInfo.id) {
            startY = oldY + dropInfo.deltaY;
          } else {
            startY = oldY + (dropInfo.previewOffsets.get(id) ?? 0);
          }
        }

        if (Math.abs(startY - newY) > 0.5) {
          const ty = getTranslateY(id);
          ty.setValue(startY - newY);
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
      for (const key of translateYs.current.keys()) {
        if (!nextPositions.has(key)) translateYs.current.delete(key);
      }
    };
    // Measure each card's top relative to the list container, not the window.
    // Window/viewport coordinates drift by the scroll offset, so a row dropped
    // after the user scrolled would FLIP from a stale position and the whole
    // list would appear to slide up and settle back. Container-relative tops
    // cancel the scroll (card and container move together), so unmoved rows
    // read identical positions across renders and only reordered rows animate.
    const measureCards = (containerY: number | null) => {
      for (const id of ids) {
        const node = cardRefs.current.get(id);
        if (!node) {
          if (--remaining === 0) finish();
          continue;
        }
        measureY(node, (y) => {
          if (y != null) nextPositions.set(id, containerY != null ? y - containerY : y);
          if (--remaining === 0) finish();
        });
      }
    };
    if (containerRef.current) measureY(containerRef.current, measureCards);
    else measureCards(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, draggingKey]);

  return (
    <View
      ref={(node) => {
        containerRef.current = node as unknown as Measurable | null;
      }}
    >
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
            active={draggingKey === id}
            gap={gap}
            heightsRef={heightsRef}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragFinish={handleDragFinish}
            registerCard={registerCard}
            flipTranslateY={getTranslateY(id)}
            previewTranslateY={getPreviewTranslateY(id)}
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
  activeRow: {
    zIndex: 20,
    elevation: 8,
  },
});
