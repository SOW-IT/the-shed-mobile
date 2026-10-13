import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onEdit: () => void;
  onDelete: () => void;
};

export function MusicActionsMenu({ onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Song options"
        onPress={() => setOpen(true)}
        style={styles.trigger}
      >
        <Ionicons name="ellipsis-vertical" size={20} color="#777" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            <Pressable
              style={styles.option}
              onPress={() => {
                setOpen(false);
                onEdit();
              }}
            >
              <Ionicons name="pencil-outline" size={18} color="#2563eb" />
              <Text style={styles.optionText}>Edit</Text>
            </Pressable>

            <View style={styles.divider} />

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
        </Pressable>
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
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  menu: {
    width: 200,
    borderRadius: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#222",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#ddd",
  },
});
