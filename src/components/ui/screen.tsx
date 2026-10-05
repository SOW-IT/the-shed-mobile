import { Ionicons } from "@expo/vector-icons";
import { ReactNode, Ref, useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { USE_NATIVE_DRIVER, typography, useAppTheme } from "@/theme";
import { FOOTER_MIN_CLEARANCE, footerClearance } from "@/lib/footerClearance";
import { FooterHeightContext } from "./buttons";
import { Toast, ToastState } from "./feedback";
import { Segment } from "./forms";
import { FadeInView } from "./primitives";
import { styles } from "./styles";

const NEAR_BOTTOM = 600;

/**
 * A scrolling stack screen with an optional back/title header and footer. The
 * content pads its bottom to clear the footer once it has been measured.
 */
export const Screen = ({
  children,
  toast,
  scrollRef,
  footer,
  title,
  subtitle,
  headerRight,
  onBack,
  onEndReached,
  stickyHeaderIndices,
  maxWidth,
  onFooterHeightChange,
}: {
  children?: ReactNode;
  toast?: ToastState;
  scrollRef?: Ref<ScrollView>;
  footer?: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  onBack?: () => void;
  onEndReached?: () => void;
  stickyHeaderIndices?: number[];
  maxWidth?: number;
  /** How far the footer reaches up from the bottom of the screen, once measured. */
  onFooterHeightChange?: (height: number) => void;
}) => {
  const t = useAppTheme();
  const headerShown = !!(title || headerRight || onBack);
  const resolvedStickyIndices = stickyHeaderIndices?.map(
    (i) => i + (headerShown ? 1 : 0)
  );
  const lastEndReachedHeight = useRef(-1);
  const onEndReachedRef = useRef(onEndReached);
  useEffect(() => {
    onEndReachedRef.current = onEndReached;
  }, [onEndReached]);
  const insets = useSafeAreaInsets();
  const [footerHeight, setFooterHeight] = useState(0);
  const onFooterHeightChangeRef = useRef(onFooterHeightChange);
  useEffect(() => {
    onFooterHeightChangeRef.current = onFooterHeightChange;
  }, [onFooterHeightChange]);
  const reportFooterHeight = useCallback((height: number) => {
    setFooterHeight(height);
    onFooterHeightChangeRef.current?.(height);
  }, []);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={resolvedStickyIndices}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[
          styles.scroll,
          maxWidth != null && { maxWidth },
          footer != null && {
            paddingBottom: footerClearance(
              footerHeight,
              insets.bottom + FOOTER_MIN_CLEARANCE
            ),
          },
        ]}
        scrollEventThrottle={onEndReached ? 16 : undefined}
        onScroll={
          onEndReached
            ? ({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                if (contentSize.height < lastEndReachedHeight.current) {
                  lastEndReachedHeight.current = -1;
                }
                const distanceFromBottom =
                  contentSize.height - (contentOffset.y + layoutMeasurement.height);
                if (
                  distanceFromBottom < NEAR_BOTTOM &&
                  contentSize.height > lastEndReachedHeight.current
                ) {
                  lastEndReachedHeight.current = contentSize.height;
                  onEndReachedRef.current?.();
                }
              }
            : undefined
        }
      >
        {(title || headerRight || onBack) && (
          <FadeInView>
            <View style={styles.header}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="chevron-back" size={26} color={t.text} />
                </Pressable>
              ) : null}
              <View style={styles.headerText}>
                {subtitle ? (
                  <Text style={[typography.caption, { color: t.muted, marginBottom: 2 }]}>
                    {subtitle}
                  </Text>
                ) : null}
                {title ? (
                  <Text style={[typography.largeTitle, { color: t.text }]}>{title}</Text>
                ) : null}
              </View>
              {headerRight}
            </View>
          </FadeInView>
        )}
        {children}
      </ScrollView>
      <FooterHeightContext.Provider value={reportFooterHeight}>
        {footer}
      </FooterHeightContext.Provider>
      <Toast toast={toast ?? null} />
    </SafeAreaView>
  );
};

export const TabBar = ({
  segments,
  active,
  onChange,
  position,
}: {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
  position?: Animated.Value;
}) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(
    segments.findIndex((segment) => segment.key === active),
    0
  );
  const [internal] = useState(() => new Animated.Value(activeIndex));
  const pos = position ?? internal;
  useEffect(() => {
    if (position) return;
    Animated.spring(internal, {
      toValue: activeIndex,
      useNativeDriver: USE_NATIVE_DRIVER,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [activeIndex, position, internal]);

  if (segments.length < 2) return null;
  const segWidth = width / segments.length;
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidth],
  });
  return (
    <View
      style={[styles.tabBar, { borderBottomColor: t.separator }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segments.map((segment) => {
        const selected = segment.key === active;
        return (
          <Pressable
            key={segment.key}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.key)}
          >
            <View style={styles.tabLabelRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  { color: selected ? t.text : t.muted },
                  selected && { fontWeight: "700" },
                ]}
              >
                {segment.label}
              </Text>
              {segment.badge ? (
                <View style={[styles.tabBadge, { backgroundColor: t.warning }]}>
                  <Text style={styles.tabBadgeText}>{segment.badge}</Text>
                </View>
              ) : null}
              {segment.messageBadge ? (
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cccccc" },
                  ]}
                >
                  <Text style={[styles.tabBadgeText, { color: "#333333" }]}>
                    {segment.messageBadge}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.tabIndicator} />
          </Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabIndicatorBar,
            { width: segWidth, backgroundColor: t.primary, transform: [{ translateX }] },
          ]}
        />
      ) : null}
    </View>
  );
};
