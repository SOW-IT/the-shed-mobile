import { useMutation } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Btn, ErrorBanner, Field, Muted, runBusy, Sheet } from "@/components/ui";
import { spacing } from "@/theme";

// The team's list of "What is it about?" options, one per line.
export const GrievanceOptionsSheet = ({
  visible,
  categories,
  onClose,
}: {
  visible: boolean;
  categories: string[];
  onClose: () => void;
}) => {
  const save = useMutation(api.grievances.setCategories);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = text ?? categories.join("\n");
  const close = () => {
    setText(null);
    setError(null);
    onClose();
  };
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title="Form options"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Btn
            title="Save Options"
            loading={busy}
            disabled={value === categories.join("\n")}
            onPress={() =>
              void runBusy(busy, setBusy, setError, () => save({ categories: value.split("\n") }), close)
            }
          />
          <Btn title="Back" variant="ghost" onPress={close} />
        </View>
      }
    >
      <Muted>
        The choices for &quot;What is it about?&quot;, one per line, in the order they&apos;re shown.
        Grievances already raised keep the wording they were raised with.
      </Muted>
      <Field label="Options" value={value} onChangeText={setText} autoCapitalize="sentences" multiline />
      <ErrorBanner message={error} />
    </Sheet>
  );
};
