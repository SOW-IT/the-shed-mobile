import { useQuery } from "convex/react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { Card, Muted, Screen, SectionTitle } from "@/components/ui";

const Person = ({
  person,
  bold,
  tag,
}: {
  person: { email: string; name: string | null; role: string | null };
  bold?: boolean;
  tag?: string;
}) => (
  <View style={styles.personRow}>
    <Text style={[styles.personName, bold && { fontWeight: "700" }]}>
      {person.name ?? person.email}
    </Text>
    <Text style={styles.personMeta}>
      {tag ?? person.role ?? ""}
      {person.name ? ` • ${person.email}` : ""}
    </Text>
  </View>
);

export default function OrgChartScreen() {
  const chart = useQuery(api.directory.orgChart);

  if (chart === undefined) {
    return (
      <Screen>
        <Muted>Loading…</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionTitle>Organisation — {chart.year}</SectionTitle>

      {chart.director ? (
        <View style={styles.directorWrap}>
          <Card>
            <Text style={styles.directorLabel}>Director</Text>
            <Person person={chart.director} bold tag="Director" />
          </Card>
          <Text style={styles.connector}>│</Text>
        </View>
      ) : (
        <Muted>No Director assigned for {chart.year} yet.</Muted>
      )}

      {chart.divisions.map((division) => (
        <View key={division.name}>
          <Text style={styles.divisionTitle}>{division.name} Division</Text>
          {division.departments.length === 0 ? (
            <Muted>No departments.</Muted>
          ) : (
            division.departments.map((department) => (
              <View
                key={department.name}
                style={[
                  styles.departmentCard,
                  { borderLeftColor: department.colour ?? "#2563eb" },
                ]}
              >
                <Text style={styles.departmentName}>{department.name}</Text>
                {department.head ? (
                  <Person person={department.head} bold tag="Head of Department" />
                ) : (
                  <Muted>No head assigned</Muted>
                )}
                {department.members.map((member) => (
                  <Person key={member.email} person={member} />
                ))}
                {department.members.length === 0 && !department.head ? (
                  <Muted>No members yet</Muted>
                ) : null}
              </View>
            ))
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  directorWrap: { alignItems: "stretch" },
  directorLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  connector: { textAlign: "center", color: "#9ca3af", fontSize: 18 },
  divisionTitle: { fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  departmentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
    gap: 6,
  },
  departmentName: { fontSize: 15, fontWeight: "700" },
  personRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap" },
  personName: { fontSize: 14 },
  personMeta: { fontSize: 12, color: "#6b7280" },
});
