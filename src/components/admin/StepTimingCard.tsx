import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { formatDuration } from "@shared/datetime";
import { Card, LoadingState, Muted, SectionTitle, Txt } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

const PEOPLE_SHOWN = 5;

export const StepTimingCard = ({ year }: { year: number }) => {
  const t = useAppTheme();
  const sections = useQuery(api.stepTiming.summary, { year });
  if (sections === null) return null;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Step timing · {year}</SectionTitle>
      <Card>
        <Muted>
          How long each step took before someone actioned it, from the audit trail of every
          request made in {year}: the typical (median) wait and the longest, then the people
          who actioned it most.
        </Muted>
        {sections === undefined ? <LoadingState /> : null}
        {sections?.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={[typography.label, { color: t.muted }]}>{section.label}</Text>
            {section.steps.length === 0 ? (
              <Muted>Nothing actioned yet.</Muted>
            ) : (
              section.steps.map((step) => (
                <View key={step.key} style={styles.step}>
                  <View style={styles.stepRow}>
                    <Txt style={{ fontWeight: "600" }}>{step.label}</Txt>
                    <Text style={[typography.caption, { color: t.muted }]}>
                      {step.count} · median {formatDuration(step.medianMs)} · longest{" "}
                      {formatDuration(step.longestMs)}
                    </Text>
                  </View>
                  {step.people.slice(0, PEOPLE_SHOWN).map((person) => (
                    <View key={person.email} style={styles.personRow}>
                      <Text
                        numberOfLines={1}
                        style={[typography.caption, { color: t.text, flex: 1 }]}
                      >
                        {person.name}
                      </Text>
                      <Text style={[typography.caption, { color: t.muted }]}>
                        {person.count} · {formatDuration(person.medianMs)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        ))}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  section: { gap: spacing.xs, marginTop: spacing.sm },
  step: { gap: 2, paddingVertical: 4 },
  stepRow: { gap: 2 },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.md,
  },
});
