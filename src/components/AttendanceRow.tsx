import { Avatar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { roleNeedsUniversity, universityColour } from "../../shared/flow";
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
 * A roll-call row with direction-based swipe gestures (time-to-rollcall style).
 * A horizontal drag anywhere on the card acts; the side is chosen by the drag
 * DIRECTION rather than where the finger landed, so the whole card is swipeable.
 * A vertical drag fails the pan first (see failOffsetY below) so it falls through
 * to the surrounding list scroll instead of dragging the card:
 *
 *  - Drag LEFT → primary action (sign in / sign out). Reveals the arrow; past the
 *    commit distance (or a fast fling) the row flings off and `onAction` fires. A
 *    shorter drag — or a tap on the right third — snaps open to the arrow preview
 *    (visual only); only a full drag or fling commits.
 *  - Drag RIGHT → edit. Reveals the pencil; a full swipe (or tapping the revealed
 *    strip) opens the edit modal. A tap on the left third snaps open the pencil
 *    preview.
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

/**
 * Duration of a row's entrance (height/opacity grow-in). Exported so callers
 * that gate on the entrance finishing — e.g. clearing a "newly added" flag in
 * the roster screen — stay in sync with this value instead of hard-coding it.
 */
export const ATTENDANCE_ROW_ENTER_MS = 200;
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
  roles?: string[];
  mode: AttendanceRowMode;
  /** When true, swipes and taps do not fire actions (past event, editing locked). */
  disabled?: boolean;
  /**
   * Greys the card out (reduced opacity). Kept separate from `disabled` so a row
   * can be made non-interactive — e.g. while its optimistic sign-in/out mutation
   * is in flight — without dimming it. Locked rows (past-event attendees, editing
   * disabled) pass both.
   */
  dimmed?: boolean;
  /**
   * Disables only the primary (sign in/out) gesture while leaving edit usable —
   * e.g. a protected attendee on a past event who may be relabelled but not
   * signed out. The right-side swipe/tap falls through to scroll.
   */
  actionDisabled?: boolean;
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
  roles = [],
  mode,
  disabled = false,
  dimmed = false,
  actionDisabled = false,
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
  const hasStaffRole = roles.some((role) => !roleNeedsUniversity(role));
  const campusPillLabel =
    hasStaffRole ? "STAFF" : university ? subgroupLabel(university) : "OTHER";
  const campusPillBackground = campusColour ?? t.ghost;
  const campusPillText = campusColour ? contrastingText(campusColour) : t.ghostText;
  const primaryIcon =
    mode === "suggested" ? "arrow-forward" : "arrow-undo";

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const itemHeight = useSharedValue(entering ? 0 : 72);
  const opacity = useSharedValue(entering ? 0 : 1);
  const marginBottomValue = useSharedValue(entering ? 0 : spacing.sm);
  const editSnapped = useSharedValue(false);
  const primarySnapped = useSharedValue(false);
  const [snapVisual, setSnapVisual] = useState<SnapVisual>("closed");
  // Web only: while a horizontal swipe is actively dragging the card, flip the
  // card's CSS touch-action from "pan-y" to "none" so the browser stops
  // co-scrolling the list vertically for the rest of that gesture — a move can
  // either swipe the card OR scroll the list, never both. A move that begins
  // vertically fails the pan first (failOffsetY) and never activates it, so it
  // still falls through to scroll. No-op on native, where an activated pan
  // already blocks the surrounding scroll.
  const [scrollLocked, setScrollLocked] = useState(false);

  /* eslint-disable react-hooks/immutability -- these are Reanimated shared
     values, mutated through their `.value` API inside effects and worklets; the
     React Compiler immutability rule doesn't model Reanimated's mutable refs. */
  useEffect(() => {
    if (!entering) return;
    const enter = { duration: ATTENDANCE_ROW_ENTER_MS, easing: Easing.out(Easing.cubic) };
    itemHeight.value = withTiming(72, enter);
    marginBottomValue.value = withTiming(spacing.sm, enter);
    opacity.value = withTiming(1, enter);
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
    // Declarative activation (vs. manualActivation + onTouchesDown/Move): the
    // row only captures the touch for a clearly horizontal drag (past 16px on
    // X). A vertical drag fails the pan first (at 10px on Y) so the touch falls
    // through to the surrounding scroll views — the inner not-signed-in list
    // first, then the page once it reaches its end. failOffsetY is intentionally
    // tighter than activeOffsetX so a near-vertical (slightly diagonal) scroll
    // releases instead of being swallowed — so a vertical scroll started
    // anywhere on a card falls through to the list. The low-level touch-event
    // APIs aren't supported on react-native-gesture-handler's web backend, so
    // the direction gating below lives in onUpdate/onEnd — which run on web too.
    .activeOffsetX([-16, 16])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onStart(() => {
      // The pan only activates past activeOffsetX — i.e. a clearly horizontal
      // drag — so from here this gesture owns the move. Lock out vertical scroll
      // (web; see scrollLocked) for the remainder of the gesture.
      runOnJS(setScrollLocked)(true);
    })
    .onFinalize(() => {
      runOnJS(setScrollLocked)(false);
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      // An already-open card can be dragged from anywhere on it so the whole
      // card swipes back to closed (or on to commit). It stays on its own side
      // (clamped to one side of 0).
      if (primarySnapped.value) {
        translateX.value = Math.max(-rowWidth, Math.min(0, next));
        return;
      }
      if (editSnapped.value) {
        translateX.value = Math.min(rowWidth, Math.max(0, next));
        return;
      }
      // Closed: the side follows the drag DIRECTION, not where the finger
      // landed, so the card is swipeable from anywhere. A leftward drag reveals
      // the primary action; a rightward drag reveals edit. A disabled side
      // (left-drag with actionDisabled, right-drag with no onEdit) stays put.
      // A disabled side snaps back to 0 rather than holding its last offset, so
      // reversing direction past the origin into the disabled side cancels the
      // drag instead of leaving the card stuck open on the just-dragged side.
      if (next < 0) {
        translateX.value = actionDisabled ? 0 : Math.max(-rowWidth, next);
      } else if (next > 0) {
        translateX.value = onEdit ? Math.min(rowWidth, next) : 0;
      } else {
        translateX.value = 0;
      }
    })
    .onEnd((e) => {
      const x = translateX.value;
      const leftDrag = -x;
      const rightDrag = x;

      // Already open: a swipe from anywhere on the card commits if pushed on,
      // closes if dragged back past the halfway point (or flung back), else
      // re-snaps to the open preview.
      if (primarySnapped.value) {
        if (leftDrag + REVEALED_BONUS > commitDistance || e.velocityX < -VELOCITY_COMMIT) {
          flingPrimary();
          return;
        }
        if (x > -SNAP_POSITION / 2 || e.velocityX > VELOCITY_COMMIT) {
          resetSnap();
          return;
        }
        translateX.value = slideTo(-SNAP_POSITION);
        return;
      }
      if (editSnapped.value) {
        if (rightDrag + REVEALED_BONUS > commitDistance || e.velocityX > VELOCITY_COMMIT) {
          commitEdit();
          return;
        }
        if (x < SNAP_POSITION / 2 || e.velocityX < -VELOCITY_COMMIT) {
          resetSnap();
          return;
        }
        translateX.value = slideTo(SNAP_POSITION);
        return;
      }

      // Closed: commit by the resulting drag direction. A leftward drag drives
      // the primary action; a rightward drag drives edit.
      if (x < 0 && !actionDisabled) {
        if (leftDrag + FRESH_BONUS > commitDistance || e.velocityX < -VELOCITY_COMMIT) {
          flingPrimary();
          return;
        }
        if (leftDrag > REVEAL_THRESHOLD) {
          primarySnapped.value = true;
          editSnapped.value = false;
          runOnJS(setSnapPrimary)();
          translateX.value = slideTo(-SNAP_POSITION);
          return;
        }
        resetSnap();
        return;
      }

      if (x > 0 && onEdit) {
        if (rightDrag + FRESH_BONUS > commitDistance || e.velocityX > VELOCITY_COMMIT) {
          commitEdit();
          return;
        }
        if (rightDrag > REVEAL_THRESHOLD) {
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
      if (e.x > rowWidth - third && !actionDisabled) {
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
      style={[styles.container, containerStyle, dimmed && styles.disabled]}
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

      {/* touchAction (web only): react-native-gesture-handler's web backend
          sets the card's CSS touch-action to "none" by default, which tells the
          browser not to scroll when a touch starts on the card — so a vertical
          drag begun on a card was swallowed and the list never scrolled
          (failOffsetY can't help once the browser is told not to scroll). "pan-y"
          hands vertical panning back to the browser (native list scroll) while
          the handler still owns horizontal swipes. Once a horizontal swipe
          activates (onStart → scrollLocked) we switch back to "none" so the
          browser stops co-scrolling the list for the rest of that gesture — the
          move swipes the card OR scrolls, never both. No-op on native. */}
      <GestureDetector gesture={composed} touchAction={scrollLocked ? "none" : "pan-y"}>
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
