import { useAppTheme } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import type { View as RNView } from "react-native";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  onEdit: () => void;
  onDelete: () => void;
};

const MENU_WIDTH = 180;
const MENU_HEIGHT = 104;
const MARGIN = 12;

export function MusicActionsMenu({ onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<React.ElementRef<typeof RNView>>(null);
  const { width, height } = useWindowDimensions();
  const t = useAppTheme();

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const left = Math.max(
        MARGIN,
        Math.min(x + w - MENU_WIDTH, width - MENU_WIDTH - MARGIN),
      );

      const top =
        y + h + MENU_HEIGHT + MARGIN <= height
          ? y + h + 4
          : Math.max(MARGIN, y - MENU_HEIGHT - 4);

      setPosition({ top, left });
      setOpen(true);
    });
  };

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Song options"
          onPress={openMenu}
          style={styles.trigger}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={t.text} />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close song options"
          />

          <View
            style={[
              styles.menu,
              {
                top: position.top,
                left: position.left,
                backgroundColor: t.inputBackground,
              },
            ]}
          >
            <Pressable
              style={styles.option}
              onPress={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Ionicons name="pencil-outline" size={18} color={t.text} />
              <Text style={[styles.optionText, { color: t.text }]}>Edit</Text>
            </Pressable>

            <View
              style={[
                styles.divider,
                { backgroundColor: t.text, opacity: 0.12 },
              ]}
            />

            <Pressable
              style={styles.option}
              onPress={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={[styles.optionText, { color: "#dc2626" }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    borderRadius: 12,
    paddingVertical: 4,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
