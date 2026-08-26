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

const REVEAL_THRESHOLD = 47;
const SNAP_POSITION = 47;
const REVEALED_BONUS = 80;
const FRESH_BONUS = 20;
const VELOCITY_COMMIT = 1200;

const SLIDE_MS = 280;

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
  disabled?: boolean;
  dimmed?: boolean;
  actionDisabled?: boolean;
  onAction: () => void;
  onActionStart?: () => void;
  onEdit?: () => void;
  highlightSignedIn?: boolean;
  entering?: boolean;
  exiting?: boolean;
  onExited?: () => void;
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
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const rowWidth = measuredWidth || Math.min(screenWidth, 720) - spacing.lg * 2;
  const commitDistance = rowWidth / 2;
  const primaryColor = mode === "suggested" ? t.success : t.danger;
  const campusColour = university ? universityColour(university) : undefined;
  const hasStaffRole = roles.some((role) => !roleNeedsUniversity(role));
  const campusPillLabel =
    university ? subgroupLabel(university) : hasStaffRole ? "STAFF" : "OTHER";
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
    runOnJS(onAction)();
    translateX.value = withTiming(-rowWidth, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 });
    marginBottomValue.value = withTiming(0, { duration: 200 });
    itemHeight.value = withTiming(0, { duration: 200 });
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

  const onPrimaryStripPress = () => {
    if (actionDisabled) return;
    flingPrimary();
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-16, 16])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onStart(() => {
      runOnJS(setScrollLocked)(true);
    })
    .onFinalize(() => {
      runOnJS(setScrollLocked)(false);
    })
    .onUpdate((e) => {
      const next = startX.value + e.translationX;
      if (primarySnapped.value) {
        translateX.value = Math.max(-rowWidth, Math.min(0, next));
        return;
      }
      if (editSnapped.value) {
        translateX.value = Math.min(rowWidth, Math.max(0, next));
        return;
      }
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
      if (editSnapped.value || primarySnapped.value) {
        resetSnap();
        return;
      }
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

      {snapVisual === "primary" && !actionDisabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === "suggested" ? "Sign in" : "Sign out"}
          style={[styles.actionHit, styles.primaryHit, { width: SNAP_POSITION }]}
          onPress={onPrimaryStripPress}
        />
      ) : null}

      <GestureDetector gesture={composed} touchAction={scrollLocked ? "none" : "pan-y"}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel={name}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
          }}
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
