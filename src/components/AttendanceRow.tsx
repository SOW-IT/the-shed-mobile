import { Avatar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { universityColour } from "../../shared/flow";
import { contrastingText, subgroupLabel } from "../../shared/rollcall";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/**
 * A roll-call row with edge-anchored swipe gestures (time-to-rollcall style).
 * A gesture only acts when the touch STARTS within the outer third of the card
 * on the matching side, so a grab in the middle third never triggers an action
 * (and never fights the vertical list scroll):
 *
 *  - RIGHT third → primary action (sign in / sign out). Drag left to reveal the
 *    arrow; past the commit distance (or a fast fling) the row flings off and
 *    `onAction` fires. A shorter drag — or a tap on the right third — snaps open
 *    to the arrow preview (visual only); only a full drag or fling commits.
 *  - LEFT third → edit. Drag right to reveal the pencil; a full swipe (or tapping
 *    the revealed strip) opens the edit modal. A tap on the left third snaps open
 *    the pencil preview.
 *
 * Tapping the card while a preview is open closes it; a tap in the middle third
 * does nothing.
 */

/** Minimum drag (px) before snapping to the revealed affordance. */
const REVEAL_THRESHOLD = 47;
/** How far the row snaps when revealing an action without committing. */
const SNAP_POSITION = 47;
/** Extra distance credited when already snapped open (easier to commit). */
const REVEALED_BONUS = 80;
const FRESH_BONUS = 20;
/** px/ms — matches time-to-rollcall velocity threshold (1.2). */
const VELOCITY_COMMIT = 1200;

/** Snap / reset duration — matches time-to-rollcall (0.3s). */
const SLIDE_MS = 280;
const slideTo = (toValue: number) => {
  "worklet";
  return withTiming(toValue, {
    duration: SLIDE_MS,
    easing: Easing.out(Easing.cubic),
  });
};

type SnapVisual = "closed" | "primary" | "edit";

export type AttendanceRowMode = "suggested" | "signedIn";

export interface AttendanceRowProps {
  name: string;
  subtitle?: string;
  photo?: string | null;
  university?: string;
  mode: AttendanceRowMode;
  /** When true, swipes and taps do not fire actions (past event, editing locked). */
  disabled?: boolean;
  /** Sign in / sign out — fired after a left swipe (or tap). */
  onAction: () => void;
  /** Fired the moment a left swipe commits (before the collapse animation completes). */
  onActionStart?: () => void;
  /** Member edit — fired after a right swipe past the commit distance. Row stays in the list. */
  onEdit?: () => void;
  /** Blue-tinted card background (e.g. signed-in member visible while searching). */
  highlightSignedIn?: boolean;
  /** When true, row enters from height 0 → 72 on mount (for optimistic list insertion). */
  entering?: boolean;
  /** When set to true after mount, collapses the row and calls onExited when done. */
  exiting?: boolean;
  /** Called after the exit collapse animation completes. */
  onExited?: () => void;
  /**
   * Increment to trigger an expand animation on an already-mounted row
   * (used when the row above is swiped away and this one needs to slide in).
   */
  revealTrigger?: number;
}

function AttendanceRowBase({
  name,
  subtitle,
  photo,
  university,
  mode,
  disabled = false,
  onAction,
  onActionStart,
  onEdit,
  highlightSignedIn = false,
  entering = false,
  exiting = false,
  onExited,
  revealTrigger = 0,
}: AttendanceRowProps) {
  const t = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const rowWidth = Math.min(screenWidth, 720) - spacing.lg * 2;
  const commitDistance = rowWidth / 2;
  const primaryColor = mode === "suggested" ? t.success : t.danger;
  const campusColour = university ? universityColour(university) : undefined;
  const campusPillLabel = university ? subgroupLabel(university) : "OTHER";
  const campusPillBackground = campusColour ?? t.ghost;
  const campusPillText = campusColour ? contrastingText(campusColour) : t.ghostText;
  const primaryIcon =
    mode === "suggested" ? "arrow-forward" : "arrow-undo";

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  // Which third of the card the active gesture started in — gates whether a
  // swipe/tap may act, and on which side. Captured on touch-down.
  const startZone = useSharedValue<"left" | "right" | "middle">("middle");
  // Raw touch-down position, used to decide horizontal vs. vertical intent
  // under manual activation (so a middle-third or vertical drag scrolls the page
  // instead of being captured by this row).
  const startTouchX = useSharedValue(0);
  const startTouchY = useSharedValue(0);
  const itemHeight = useSharedValue(entering ? 0 : 72);
  const opacity = useSharedValue(entering ? 0 : 1);
  const marginBottomValue = useSharedValue(entering ? 0 : spacing.sm);
  const editSnapped = useSharedValue(false);
  const primarySnapped = useSharedValue(false);
  const [snapVisual, setSnapVisual] = useState<SnapVisual>("closed");

  /* eslint-disable react-hooks/immutability -- these are Reanimated shared
     values, mutated through their `.value` API inside effects and worklets; the
     React Compiler immutability rule doesn't model Reanimated's mutable refs. */
  useEffect(() => {
    if (!entering) return;
    itemHeight.value = withTiming(72, { duration: 200, easing: Easing.out(Easing.cubic) });
    marginBottomValue.value = withTiming(spacing.sm, { duration: 200, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount
  }, []);

  useEffect(() => {
    if (!exiting) return;
    opacity.value = withTiming(0, { duration: 180 });
    itemHeight.value = withTiming(0, { duration: 200 }, (done) => {
      if (done && onExited) runOnJS(onExited)();
    });
    marginBottomValue.value = withTiming(0, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when exiting flips true
  }, [exiting]);

  useEffect(() => {
    if (revealTrigger === 0) return;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when trigger increments
  }, [revealTrigger]);

  const setSnapClosed = useCallback(() => setSnapVisual("closed"), []);
  const setSnapPrimary = useCallback(() => setSnapVisual("primary"), []);
  const setSnapEdit = useCallback(() => setSnapVisual("edit"), []);

  const flingPrimary = () => {
    "worklet";
    editSnapped.value = false;
    primarySnapped.value = false;
    runOnJS(setSnapClosed)();
    if (onActionStart) runOnJS(onActionStart)();
    translateX.value = withTiming(-rowWidth, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 });
    marginBottomValue.value = withTiming(0, { duration: 200 });
    itemHeight.value = withTiming(0, { duration: 200 }, (done) => {
      if (done) runOnJS(onAction)();
    });
  };
  /* eslint-enable react-hooks/immutability */

  const commitEdit = () => {
    "worklet";
    if (onEdit) runOnJS(onEdit)();
    editSnapped.value = false;
    primarySnapped.value = false;
    runOnJS(setSnapClosed)();
    translateX.value = slideTo(0);
  };

  const resetSnap = () => {
    "worklet";
    editSnapped.value = false;
    primarySnapped.value = false;
    runOnJS(setSnapClosed)();
    translateX.value = slideTo(0);
  };

  const onEditStripPress = () => {
    if (!onEdit) return;
    editSnapped.value = false;
    primarySnapped.value = false;
    setSnapClosed();
    onEdit();
    translateX.value = slideTo(0);
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Manual activation so the row only captures the touch once we've confirmed
    // a horizontal swipe that began in an outer third. A middle-third grab, or a
    // vertical drag, is failed here and falls through to the page/list scroll.
    .manualActivation(true)
    .onTouchesDown((e) => {
      const touch = e.changedTouches[0];
      startX.value = translateX.value;
      startTouchX.value = touch.x;
      startTouchY.value = touch.y;
      // Anchor the gesture to the third it began in. The right third drives the
      // primary (left-revealing) action; the left third drives edit (right-
      // revealing); the middle third is inert.
      const third = rowWidth / 3;
      startZone.value =
        touch.x < third ? "left" : touch.x > rowWidth - third ? "right" : "middle";
    })
    .onTouchesMove((e, state) => {
      const touch = e.changedTouches[0];
      const dx = touch.x - startTouchX.value;
      const dy = touch.y - startTouchY.value;
      // Middle third never captures — let the page scroll (vertical OR horizontal).
      if (startZone.value === "middle") {
        state.fail();
        return;
      }
      // A predominantly vertical drag yields to the list's vertical scroll.
      if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
        state.fail();
        return;
      }
      // A clear horizontal swipe from an outer third captures the row.
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        state.activate();
      }
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      // Only allow the card to move in the direction its start-zone permits, so
      // a right-third grab can pull the arrow open (leftward) but not the pencil,
      // and vice versa. A middle-third grab doesn't move the card at all.
      if (startZone.value === "right") translateX.value = Math.min(0, next);
      else if (startZone.value === "left" && onEdit)
        translateX.value = Math.max(0, next);
    })
    .onEnd((e) => {
      const x = translateX.value;
      const leftDrag = -x;
      const rightDrag = x;

      if (startZone.value === "right") {
        if (
          leftDrag + (primarySnapped.value ? REVEALED_BONUS : FRESH_BONUS) >
            commitDistance ||
          e.velocityX < -VELOCITY_COMMIT
        ) {
          flingPrimary();
          return;
        }
        if (!primarySnapped.value && leftDrag > REVEAL_THRESHOLD) {
          primarySnapped.value = true;
          editSnapped.value = false;
          runOnJS(setSnapPrimary)();
          translateX.value = slideTo(-SNAP_POSITION);
          return;
        }
        resetSnap();
        return;
      }

      if (startZone.value === "left" && onEdit) {
        if (
          rightDrag + (editSnapped.value ? REVEALED_BONUS : FRESH_BONUS) >
            commitDistance ||
          e.velocityX > VELOCITY_COMMIT
        ) {
          commitEdit();
          return;
        }
        if (!editSnapped.value && rightDrag > REVEAL_THRESHOLD) {
          editSnapped.value = true;
          primarySnapped.value = false;
          runOnJS(setSnapEdit)();
          translateX.value = slideTo(SNAP_POSITION);
          return;
        }
        resetSnap();
        return;
      }

      resetSnap();
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDistance(8)
    .onEnd((e, success) => {
      if (!success || disabled) return;
      // A tap with a preview already open just closes it.
      if (editSnapped.value || primarySnapped.value) {
        resetSnap();
        return;
      }
      // Otherwise a tap in an outer third pops open that side's preview: the
      // right third reveals the arrow, the left third reveals the pencil. The
      // middle third does nothing.
      const third = rowWidth / 3;
      if (e.x > rowWidth - third) {
        primarySnapped.value = true;
        editSnapped.value = false;
        runOnJS(setSnapPrimary)();
        translateX.value = slideTo(-SNAP_POSITION);
      } else if (onEdit && e.x < third) {
        editSnapped.value = true;
        primarySnapped.value = false;
        runOnJS(setSnapEdit)();
        translateX.value = slideTo(SNAP_POSITION);
      }
    });

  const composed = Gesture.Simultaneous(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    height: itemHeight.value,
    marginBottom: marginBottomValue.value,
  }));

  const primaryLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max(-translateX.value, 0) / SNAP_POSITION,
      1
    );
    return { opacity: interpolate(progress, [0, 1], [0, 1]) * opacity.value };
  });

  const editLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max(translateX.value, 0) / SNAP_POSITION,
      1
    );
    return { opacity: onEdit ? interpolate(progress, [0, 1], [0, 1]) * opacity.value : 0 };
  });

  return (
    <Animated.View
      style={[styles.container, containerStyle, disabled && styles.disabled]}
    >
      {/* Edit — revealed when swiping right */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.actionLayer,
          editLayerStyle,
          {
            backgroundColor: t.muted,
            alignItems: "flex-start",
          },
        ]}
      >
        <Ionicons name="pencil" size={22} color="#fff" />
      </Animated.View>

      {/* Sign in / out — revealed when swiping left */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.actionLayer,
          primaryLayerStyle,
          {
            backgroundColor: primaryColor,
            alignItems: "flex-end",
          },
        ]}
      >
        <Ionicons name={primaryIcon} size={22} color="#fff" />
      </Animated.View>

      {snapVisual === "edit" && onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit member"
          style={[styles.actionHit, styles.editHit, { width: SNAP_POSITION }]}
          onPress={onEditStripPress}
        />
      ) : null}

      <GestureDetector gesture={composed}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel={name}
          style={[
            styles.card,
            {
              backgroundColor: highlightSignedIn ? t.primarySoft : t.card,
              borderColor: campusColour ?? t.separator,
              zIndex: 2,
            },
            cardStyle,
          ]}
        >
          <Avatar photo={photo ?? null} name={name} size={40} />
          <View style={styles.text}>
            <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View
            style={[
              styles.campusPill,
              {
                backgroundColor: campusPillBackground,
              },
            ]}
          >
            <Text
              style={[
                typography.caption,
                styles.campusPillText,
                { color: campusPillText },
              ]}
              numberOfLines={1}
            >
              {campusPillLabel}
            </Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export const AttendanceRow = memo(AttendanceRowBase);

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.55,
  },
  actionLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  actionHit: {
    position: "absolute",
    top: 0,
    height: 72,
    zIndex: 1,
    borderRadius: radius.lg,
  },
  editHit: { left: 0 },
  primaryHit: { right: 0 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  text: { flex: 1, gap: 2 },
  campusPill: {
    maxWidth: 92,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  campusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});
