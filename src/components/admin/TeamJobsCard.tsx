import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { TeamJob } from "@shared/teams";
import { Card, ErrorBanner, Muted, runBusy, SectionTitle, Select } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export const TeamJobsCard = ({ year }: { year: number }) => {
  const t = useAppTheme();
  const view = useQuery(api.teams.view, { year });
  const save = useMutation(api.teams.set);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!view) return null;
  const choose = (job: TeamJob, department: string) =>
    runBusy(busy, setBusy, setError, () => save({ year, job, department }));
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Teams · {year}</SectionTitle>
      <Card>
        <Muted>
          Which department does each job this staff year. Renaming a department keeps its jobs, and
          a new staff year starts with last year&apos;s choices.
        </Muted>
        <ErrorBanner message={error} />
        {view.jobs.map((job) => (
          <View key={job.job} style={styles.job}>
            <Text style={[typography.headline, { color: t.text }]}>{job.title}</Text>
            <Text style={[typography.caption, { color: t.muted }]}>{job.does}</Text>
            <Select
              label="Department"
              value={job.department}
              options={[
                ...(job.exists ? [] : [{ label: `${job.department} (missing)`, value: job.department }]),
                ...view.departments.map((name) => ({ label: name, value: name })),
              ]}
              onSelect={(department) => {
                if (department !== job.department) void choose(job.job, department);
              }}
              disabled={!view.editable || busy}
            />
            {job.exists ? null : (
              <Text style={[typography.caption, { color: t.warning }]}>
                {job.department} doesn&apos;t exist in {year}. Choose a department for this job.
              </Text>
            )}
          </View>
        ))}
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  job: { gap: spacing.xs },
});
