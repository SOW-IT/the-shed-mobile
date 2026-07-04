import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { universityColour } from "../../../shared/flow";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { AdminBar } from "@/components/AdminBar";
import { ChromeScreen } from "@/components/ChromeScreen";
import {
  Avatar,
  FadeInView,
  FloatingYearPicker,
  LoadingState,
  Muted,
  stagger,
  Txt,
} from "@/components/ui";

const Person = ({
  person,
  bold,
  tag,
  size = 36,
}: {
  person: { email: string; name: string | null; photo: string | null; role: string | null };
  bold?: boolean;
  tag?: string;
  size?: number;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.5 }]}
      onPress={() =>
        router.push({ pathname: "/person/[email]", params: { email: person.email } })
      }
    >
      <Avatar photo={person.photo} name={person.name} size={size} />
      <Txt style={[styles.personName, bold && styles.personNameBold]} numberOfLines={1}>
        {person.name ?? person.email}
      </Txt>
      <Text style={[typography.caption, styles.personTag, { color: t.faint }]} numberOfLines={1}>
        {tag ?? person.role ?? ""}
      </Text>
    </Pressable>
  );
};

export default function OrgChartScreen() {
  const t = useAppTheme();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const chart = useQuery(
    api.directory.orgChart,
    selectedYear === null ? {} : { year: selectedYear }
  );
  // Admin tools moved off the tab bar: signed-in admins / the Finance head
  // reach them from a button at the top of this list.
  const me = useQuery(api.directory.me);
  const showAdmin = !!(me?.isAdmin || me?.isFinanceHead);

  if (!chart) {
    return (
      <ChromeScreen>
        <LoadingState />
      </ChromeScreen>
    );
  }

  return (
    <ChromeScreen
      floating={
        chart.availableYears.length > 1 ? (
          <FloatingYearPicker
            year={chart.year}
            years={chart.availableYears}
            onSelect={setSelectedYear}
            formatLabel={(y) =>
              y === chart.nextYear ? `${y} · Next year` : String(y)
            }
          />
        ) : undefined
      }
    >
      {/* Admin tools — only for admins / the Finance head, above the Director. */}
      {showAdmin ? <AdminBar /> : null}

      {/* Director */}
      {chart.director ? (
        <FadeInView delay={40}>
          <View style={[styles.directorCard, t.shadowCard, { backgroundColor: t.card }]}>
            <Person person={chart.director} bold tag={chart.director.role ?? "Director"} size={46} />
          </View>
        </FadeInView>
      ) : (
        <Muted>No Director assigned for {chart.year} yet.</Muted>
      )}

      {/* Staff — people not in any department, division or campus, who hold a
          non-campus role. Shown at the top, just under the Director. */}
      {chart.staff.length > 0 && (
        <FadeInView delay={stagger(1)}>
          <View style={styles.divisionBlock}>
            <Text style={[typography.label, { color: t.muted }]}>Staff</Text>
            <View
              style={[
                styles.deptCard,
                t.shadowCard,
                { backgroundColor: t.card, borderLeftColor: t.primary },
              ]}
            >
              {chart.staff.map((member) => (
                <Person key={member.email} person={member} />
              ))}
            </View>
          </View>
        </FadeInView>
      )}

      {/* Divisions */}
      {chart.divisions.map((division, divisionIndex) => (
        <FadeInView key={division.name} delay={stagger(divisionIndex + 2)}>
          <View style={styles.divisionBlock}>
            {/* Division label */}
            <Text style={[typography.label, { color: t.muted }]}>
              {division.name}
            </Text>

            {/* Head of Division — contained row */}
            {division.head ? (
              <View style={[styles.divisionHeadRow, t.shadowCard, { backgroundColor: t.card }]}>
                <Person person={division.head} bold tag="Head of Division" size={34} />
              </View>
            ) : null}

            {/* Departments */}
            {division.departments.length === 0 ? (
              <Muted>No departments.</Muted>
            ) : (
              division.departments.map((dept) => (
                <View
                  key={dept.name}
                  style={[
                    styles.deptCard,
                    t.shadowCard,
                    { backgroundColor: t.card, borderLeftColor: dept.colour ?? t.primary },
                  ]}
                >
                  <Text style={[typography.label, { color: t.faint }]}>{dept.name}</Text>
                  {dept.head ? (
                    <Person person={dept.head} bold tag="Head of Dept" />
                  ) : null}
                  {dept.members.map((member) => (
                    <Person key={member.email} person={member} />
                  ))}
                  {dept.members.length === 0 && !dept.head ? (
                    <Muted>No members yet</Muted>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </FadeInView>
      ))}

      {/* Campus */}
      {chart.universities.some((u) => u.members.length > 0) && (
        <FadeInView delay={stagger(chart.divisions.length + 2)}>
          <View style={styles.divisionBlock}>
            <Text style={[typography.label, { color: t.muted }]}>Campus</Text>
            {chart.universities
              .filter((u) => u.members.length > 0)
              .map((u) => (
                <View
                  key={u.name}
                  style={[
                    styles.deptCard,
                    t.shadowCard,
                    {
                      backgroundColor: t.card,
                      borderLeftColor: universityColour(u.name) ?? t.primary,
                    },
                  ]}
                >
                  <Text style={[typography.label, { color: t.faint }]}>{u.name}</Text>
                  {u.members.map((member) => (
                    <Person key={member.email} person={member} />
                  ))}
                </View>
              ))}
          </View>
        </FadeInView>
      )}
    </ChromeScreen>
  );
}

const styles = StyleSheet.create({
  directorCard: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg - 2,
    marginBottom: spacing.md,
  },
  divisionBlock: {
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  divisionHeadRow: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
  },
  deptCard: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.lg - 2,
    gap: spacing.sm + 2,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 2,
  },
  personName: {
    fontSize: 15,
    flexGrow: 1,
    flexShrink: 1,
  },
  personNameBold: {
    fontWeight: "700",
  },
  personTag: {
    textAlign: "right",
    maxWidth: 110,
  },
});
