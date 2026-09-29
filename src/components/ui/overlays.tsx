import { Ionicons } from "@expo/vector-icons";
import { ReactNode, RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, typography, useAppTheme } from "@/theme";
import { Btn } from "./buttons";
import { Field, OptionSheet } from "./forms";
import { useRegisterModal } from "./modalPresence";
import { FastModal, Muted, Row, Txt } from "./primitives";
import { RevealFocusedInputContext } from "./revealFocus";
import { styles } from "./styles";

/**
 * Dismiss the keyboard and resolve once it's gone. Closing a sheet while its
 * keyboard is still up leaves the screen's footer button lifted, because the
 * hide event lands while the sheet still counts as open.
 */
export const dismissKeyboard = (): Promise<void> => {
  if (!Keyboard.isVisible()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      sub.remove();
      clearTimeout(timer);
      resolve();
    };
    const sub = Keyboard.addListener("keyboardDidHide", done);
    const timer = setTimeout(done, 500);
    Keyboard.dismiss();
  });
};

export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  requireText,
  confirmDisabled: confirmDisabledProp = false,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireText?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const [input, setInput] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on close
    if (!visible) setInput("");
  }, [visible]);
  const normalizedRequired = requireText?.trim();
  const confirmDisabled =
    confirmDisabledProp ||
    (normalizedRequired !== undefined && input.trim() !== normalizedRequired);
  const close = () => {
    setInput("");
    onClose();
  };
  return (
    <OptionSheet
      visible={visible}
      title={title}
      onClose={close}
      contentStyle={styles.confirmContent}
      footer={
        <Row spread>
          <Btn title={cancelLabel} variant="ghost" onPress={close} />
          <Btn
            title={confirmLabel}
            variant={destructive ? "danger" : "primary"}
            disabled={confirmDisabled}
            onPress={() => {
              onConfirm();
              close();
            }}
          />
        </Row>
      }
    >
      {message ? <Muted>{message}</Muted> : null}
      {requireText !== undefined && (
        <>
          <Txt>
            Type <Txt style={{ fontWeight: "800" }}>{normalizedRequired}</Txt> to
            confirm.
          </Txt>
          <Field
            label="Confirm"
            value={input}
            onChangeText={setInput}
            placeholder={normalizedRequired}
          />
        </>
      )}
    </OptionSheet>
  );
};

export const Sheet = ({
  visible,
  onClose,
  children,
  scrollable = true,
  title,
  headerRight,
  contentStyle,
  footer,
  stickToBottom = false,
  keyboardAnchor = "center",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  title?: string;
  headerRight?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  stickToBottom?: boolean;
  keyboardAnchor?: "center" | "bottom";
}) => {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  useRegisterModal(visible);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios" || !visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed from live keyboard on open
    setKeyboardOpen(Keyboard.isVisible());
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null);
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  // iOS only scrolls far enough to show the caret, which leaves the bottom of
  // the field (or all of a field near the end) under the sheet's edge once the
  // keyboard shrinks it. Bring the whole focused field into view instead.
  const revealFocusedInput = useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput();
    const inner = innerRef.current;
    if (!input || !inner || stickToBottom) return;
    input.measureLayout(
      inner,
      (_x, y, _width, height) => {
        // Room above for the field's label.
        const top = Math.max(y - spacing.xxl, 0);
        const bottom = y + height + spacing.md;
        const viewTop = scrollY.current;
        const viewBottom = viewTop + viewportHeight.current;
        if (bottom > viewBottom) {
          scrollRef.current?.scrollTo({
            y: Math.min(top, bottom - viewportHeight.current),
            animated: true,
          });
        } else if (top < viewTop) {
          scrollRef.current?.scrollTo({ y: top, animated: true });
        }
      },
      // The focused field is in another sheet.
      () => {}
    );
  }, [stickToBottom]);
  useEffect(() => {
    if (Platform.OS === "web" || !visible || !scrollable) return;
    const sub = Keyboard.addListener("keyboardDidShow", revealFocusedInput);
    return () => sub.remove();
  }, [visible, scrollable, revealFocusedInput]);
  // On focus, wait for iOS's own caret scroll to land and report its offset.
  const revealAfterFocus = useCallback(() => {
    if (Platform.OS === "web" || !Keyboard.isVisible()) return;
    setTimeout(revealFocusedInput, 120);
  }, [revealFocusedInput]);
  useEffect(() => {
    if (stickToBottom && keyboardOpen) scrollRef.current?.scrollToEnd({ animated: true });
  }, [stickToBottom, keyboardOpen]);
  const anchorBottomLive = keyboardAnchor === "bottom" && keyboardOpen;
  /* eslint-disable react-hooks/refs -- retain-through-fade (see OptionSheet) */
  const shownTitle = useRef(title);
  const shownChildren = useRef(children);
  const shownFooter = useRef(footer);
  const shownAnchorBottom = useRef(anchorBottomLive);
  const shownKeyboardOpen = useRef(keyboardOpen);
  if (visible) {
    shownTitle.current = title;
    shownChildren.current = children;
    shownFooter.current = footer;
    shownAnchorBottom.current = anchorBottomLive;
    shownKeyboardOpen.current = keyboardOpen;
  }
  const retainedTitle = shownTitle.current;
  const retainedChildren = shownChildren.current;
  const retainedFooter = shownFooter.current;
  const anchorBottom = shownAnchorBottom.current;
  // With the keyboard up, the sheet may use all the room above it (below the
  // status bar) rather than 70% of it, so forms keep a usable amount showing.
  const tall = shownKeyboardOpen.current;
  const hasFooter = retainedFooter != null;

  const header =
    retainedTitle !== undefined && retainedTitle !== "" ? (
      <View style={styles.optionSheetHeader}>
        <Text
          style={[typography.headline, { color: t.text, flex: 1 }]}
          numberOfLines={2}
        >
          {retainedTitle}
        </Text>
        {headerRight}
        <Pressable
          hitSlop={8}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={({ pressed }) => [
            styles.optionSheetClose,
            { backgroundColor: t.ghost },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="close" size={20} color={t.ghostText} />
        </Pressable>
      </View>
    ) : null;

  const bodyStyle = [contentStyle ?? styles.sheetContent, !hasFooter && { paddingBottom: spacing.lg }];

  return (
    <FastModal visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={spacing.md}
          pointerEvents="box-none"
          style={[
            styles.dialogOuter,
            anchorBottom && { justifyContent: "flex-end" },
            tall && { paddingTop: Math.max(spacing.xl, insets.top + spacing.sm) },
          ]}
        >
          <View style={[styles.dialog, tall && { maxHeight: "100%" }, { backgroundColor: t.card }]}>
            {header}
            {scrollable ? (
              <ScrollView
                ref={scrollRef}
                // Typed as never-null, but it is null until the sheet mounts.
                innerViewRef={innerRef as RefObject<View>}
                style={styles.sheetScroll}
                contentContainerStyle={bodyStyle}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                scrollEventThrottle={16}
                onScroll={(e) => {
                  scrollY.current = e.nativeEvent.contentOffset.y;
                }}
                onLayout={(e) => {
                  viewportHeight.current = e.nativeEvent.layout.height;
                  // The sheet just resized for the keyboard.
                  if (Keyboard.isVisible()) revealFocusedInput();
                }}
                onContentSizeChange={
                  stickToBottom
                    ? () => scrollRef.current?.scrollToEnd({ animated: true })
                    : undefined
                }
              >
                <RevealFocusedInputContext.Provider value={revealAfterFocus}>
                  {retainedChildren}
                </RevealFocusedInputContext.Provider>
              </ScrollView>
            ) : (
              <View style={[styles.sheetScroll, bodyStyle]}>{retainedChildren}</View>
            )}
            {hasFooter ? (
              <View
                style={styles.sheetFooter}
                onLayout={
                  stickToBottom
                    ? () => scrollRef.current?.scrollToEnd({ animated: true })
                    : undefined
                }
              >
                {retainedFooter}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </FastModal>
  );
  /* eslint-enable react-hooks/refs */
};
