import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { TeamJob } from "@shared/teams";
import { Btn, Card, ErrorBanner, Muted, Row, runBusy, SectionTitle, Select } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export const TeamJobsCard = ({ year }: { year: number }) => {
  const t = useAppTheme();
  const view = useQuery(api.teams.view, { year });
  const save = useMutation(api.teams.set);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ job: TeamJob; from: string; to: string } | null>(null);
  if (!view) return null;
  const choose = (job: TeamJob, department: string) =>
    runBusy(busy, setBusy, setError, () => save({ year, job, department }));
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>Teams · {year}</SectionTitle>
      <Card>
        <Muted>
          Which department does each job this staff year. A year keeps the year before&apos;s choices
          until you change them, so 1 October changes nothing, and renaming a department keeps its
          jobs.
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
                if (department !== job.department) {
                  setMoving({ job: job.job, from: job.department, to: department });
                }
              }}
              disabled={!view.editable || busy}
            />
            {moving?.job === job.job ? (
              <View style={[styles.confirm, { backgroundColor: t.ghost }]}>
                <Text style={[typography.headline, { color: t.text }]}>
                  Move {job.title} to {moving.to}?
                </Text>
                <Muted>
                  {`${job.does} ${moving.to} does this in ${year} instead of ${moving.from}.`}
                  {job.job === "admin"
                    ? ` Anyone who is an admin only through ${moving.from} stops being one, which may include you.`
                    : ""}
                </Muted>
                <Row>
                  <Btn title="Cancel" variant="ghost" onPress={() => setMoving(null)} />
                  <Btn
                    title="Move"
                    variant={job.job === "admin" ? "danger" : "primary"}
                    disabled={busy}
                    onPress={() => {
                      setMoving(null);
                      void choose(job.job, moving.to);
                    }}
                  />
                </Row>
              </View>
            ) : null}
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
  confirm: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg },
});
