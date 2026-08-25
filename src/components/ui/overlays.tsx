import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { spacing, typography, useAppTheme } from "@/theme";
import { Btn } from "./buttons";
import { Field, OptionSheet } from "./forms";
import { useRegisterModal } from "./modalPresence";
import { FastModal, Muted, Row, Txt } from "./primitives";
import { styles } from "./styles";

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
  useRegisterModal(visible);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (keyboardAnchor !== "bottom" || Platform.OS !== "ios" || !visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed from live keyboard on open
    setKeyboardOpen(Keyboard.isVisible());
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardAnchor, visible]);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (stickToBottom && keyboardOpen) scrollRef.current?.scrollToEnd({ animated: true });
  }, [stickToBottom, keyboardOpen]);
  const anchorBottomLive = keyboardAnchor === "bottom" && keyboardOpen;
  /* eslint-disable react-hooks/refs -- retain-through-fade (see OptionSheet) */
  const shownTitle = useRef(title);
  const shownChildren = useRef(children);
  const shownFooter = useRef(footer);
  const shownAnchorBottom = useRef(anchorBottomLive);
  if (visible) {
    shownTitle.current = title;
    shownChildren.current = children;
    shownFooter.current = footer;
    shownAnchorBottom.current = anchorBottomLive;
  }
  const retainedTitle = shownTitle.current;
  const retainedChildren = shownChildren.current;
  const retainedFooter = shownFooter.current;
  const anchorBottom = shownAnchorBottom.current;
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
          style={[styles.dialogOuter, anchorBottom && { justifyContent: "flex-end" }]}
        >
          <View style={[styles.dialog, { backgroundColor: t.card }]}>
            {header}
            {scrollable ? (
              <ScrollView
                ref={scrollRef}
                style={styles.sheetScroll}
                contentContainerStyle={bodyStyle}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                onContentSizeChange={
                  stickToBottom
                    ? () => scrollRef.current?.scrollToEnd({ animated: true })
                    : undefined
                }
              >
                {retainedChildren}
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
