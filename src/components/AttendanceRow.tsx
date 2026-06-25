import { Avatar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useState } from "react";
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
 * A roll-call row with bidirectional swipe gestures (time-to-rollcall style):
 *
 *  - Swipe LEFT: primary action — sign in (not signed in) or sign out (signed in).
 *    Past the commit distance (or fast fling), the row flings off and `onAction` fires.
 *    A shorter drag snaps open to preview (visual only); only a full drag or fling commits.
 *  - Swipe RIGHT: edit — snaps open to show the pencil; full swipe or tap the strip
 *    to open the edit modal.
 *
 * Tap on the card only closes a snapped-open preview — sign-in/out requires a swipe.
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
  /** Member edit — fired after a right swipe past the commit distance. Row stays in the list. */
  onEdit?: () => void;
  /** Blue-tinted card background (e.g. signed-in member visible while searching). */
  highlightSignedIn?: boolean;
}

function AttendanceRowBase({
  name,
  subtitle,
  photo,
  university,
  mode,
  disabled = false,
  onAction,
  onEdit,
  highlightSignedIn = false,
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
  const itemHeight = useSharedValue(72);
  const opacity = useSharedValue(1);
  const editSnapped = useSharedValue(false);
  const primarySnapped = useSharedValue(false);
  const [snapVisual, setSnapVisual] = useState<SnapVisual>("closed");

  const setSnapClosed = useCallback(() => setSnapVisual("closed"), []);
  const setSnapPrimary = useCallback(() => setSnapVisual("primary"), []);
  const setSnapEdit = useCallback(() => setSnapVisual("edit"), []);

  const flingPrimary = () => {
    "worklet";
    editSnapped.value = false;
    primarySnapped.value = false;
    runOnJS(setSnapClosed)();
    translateX.value = withTiming(-rowWidth, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 });
    itemHeight.value = withTiming(0, { duration: 200 }, (done) => {
      if (done) runOnJS(onAction)();
    });
  };

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
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
    })
    .onEnd((e) => {
      const x = translateX.value;
      const leftDrag = -x;
      const rightDrag = x;

      if (
        leftDrag + (primarySnapped.value ? REVEALED_BONUS : FRESH_BONUS) >
          commitDistance ||
        e.velocityX < -VELOCITY_COMMIT
      ) {
        flingPrimary();
        return;
      }

      if (
        onEdit &&
        (rightDrag + (editSnapped.value ? REVEALED_BONUS : FRESH_BONUS) >
          commitDistance ||
          e.velocityX > VELOCITY_COMMIT)
      ) {
        commitEdit();
        return;
      }

      if (!primarySnapped.value && leftDrag > REVEAL_THRESHOLD) {
        primarySnapped.value = true;
        editSnapped.value = false;
        runOnJS(setSnapPrimary)();
        translateX.value = slideTo(-SNAP_POSITION);
        return;
      }

      if (onEdit && !editSnapped.value && rightDrag > REVEAL_THRESHOLD) {
        editSnapped.value = true;
        primarySnapped.value = false;
        runOnJS(setSnapEdit)();
        translateX.value = slideTo(SNAP_POSITION);
        return;
      }

      resetSnap();
    });

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDistance(8)
    .onEnd((_e, success) => {
      if (!success || disabled) return;
      if (editSnapped.value || primarySnapped.value) {
        resetSnap();
      }
    });

  const composed = Gesture.Simultaneous(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    height: itemHeight.value,
  }));

  const primaryLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max(-translateX.value, 0) / SNAP_POSITION,
      1
    );
    return { opacity: interpolate(progress, [0, 1], [0, 1]) };
  });

  const editLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.max(translateX.value, 0) / SNAP_POSITION,
      1
    );
    return { opacity: onEdit ? interpolate(progress, [0, 1], [0, 1]) : 0 };
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
    marginBottom: spacing.sm,
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
