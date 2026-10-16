import type { ComponentProps } from "react";
import { Text, View } from "react-native";
import { Field } from "@/components/ui";
import { typography, useAppTheme } from "@/theme";

export const LabelledField = ({
  label,
  required = false,
  ...field
}: Omit<ComponentProps<typeof Field>, "label"> & { label: string; required?: boolean }) => {
  const t = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typography.label, { color: t.muted }]}>
        {label}
        {required ? <Text style={{ color: t.danger }}> *</Text> : null}
      </Text>
      <Field {...field} accessibilityLabel={required ? `${label}, required` : label} />
    </View>
  );
};
