// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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
import { Muted, Row, Txt } from "./primitives";
import { styles } from "./styles";

/**
 * A reusable confirmation dialog modelled on the Structure tab's type-to-confirm
 * sheet. Use it everywhere instead of the platform's native confirm dialogs.
 *
 * Pass `requireText` for high-stakes deletes (e.g. a person): the confirm button
 * stays disabled until the typed text matches it exactly (trimmed). Omit it for a
 * plain Cancel/Confirm dialog. `destructive` (default true) tints the confirm
 * button red; set it false for non-destructive confirmations.
 */
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
  /** When set, require the user to type this exact text before confirming. */
  requireText?: string;
  /** Externally disable the confirm button (e.g. an active cooldown). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const [input, setInput] = useState("");
  // Reset the typed text whenever the dialog closes (covers callers that flip
  // `visible` off without going through the dialog's own close handler).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on close
    if (!visible) setInput("");
  }, [visible]);
  // Normalise both sides: data-sourced requireText may carry stray whitespace.
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
          {/* Spell out — in bold — exactly what has to be typed to unlock the
              confirm button, so the required name can't be missed. */}
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

/** A centered modal dialog with a dimmed backdrop. */
export const Sheet = ({
  visible,
  onClose,
  children,
  scrollable = true,
  title,
  headerRight,
  contentStyle,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  /** Headline pinned above scrolling content, with a close affordance. */
  title?: string;
  /** Optional action rendered beside close (e.g. destructive trash icon). */
  headerRight?: ReactNode;
  /** Overrides default body padding — use for non-form content. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned action row below scrolling content (e.g. Save). */
  footer?: ReactNode;
}) => {
  const t = useAppTheme();
  /* eslint-disable react-hooks/refs -- retain-through-fade (see OptionSheet) */
  const shownTitle = useRef(title);
  const shownChildren = useRef(children);
  const shownFooter = useRef(footer);
  if (visible) {
    shownTitle.current = title;
    shownChildren.current = children;
    shownFooter.current = footer;
  }
  const retainedTitle = shownTitle.current;
  const retainedChildren = shownChildren.current;
  const retainedFooter = shownFooter.current;
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={spacing.md}
          style={[styles.dialogOuter, { pointerEvents: "box-none" }]}
        >
          <View style={[styles.dialog, { backgroundColor: t.card }]}>
            {header}
            {scrollable ? (
              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={bodyStyle}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {retainedChildren}
              </ScrollView>
            ) : (
              <View style={[styles.sheetScroll, bodyStyle]}>{retainedChildren}</View>
            )}
            {hasFooter ? (
              <View style={styles.sheetFooter}>
                {retainedFooter}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
  /* eslint-enable react-hooks/refs */
};
