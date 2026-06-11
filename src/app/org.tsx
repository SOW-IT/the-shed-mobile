import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "@/theme";
import { Avatar, Card, Muted, Row, Screen, SectionTitle, Txt } from "@/components/ui";

/** A simple dropdown: a button that opens a modal list of years. */
const YearDropdown = ({
  year,
  years,
  onSelect,
}: {
  year: number;
  years: number[];
  onSelect: (year: number) => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={[
          styles.dropdownButton,
          { backgroundColor: t.card, borderColor: t.border },
        ]}
        onPress={() => setOpen(true)}
      >
        <Txt style={styles.dropdownButtonText}>{year} ▾</Txt>
      </Pressable>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.dropdownMenu, { backgroundColor: t.card }]}>
            {years.map((y) => (
              <Pressable
                key={y}
                style={[
                  styles.dropdownItem,
                  y === year && { backgroundColor: t.ghost },
                ]}
                onPress={() => {
                  onSelect(y);
                  setOpen(false);
                }}
              >
                <Txt
                  style={[styles.dropdownItemText, y === year && { fontWeight: "700" }]}
                >
                  {y}
                </Txt>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

/** Tapping a person opens their profile (photo, church, service history). */
const Person = ({
  person,
  bold,
  tag,
}: {
  person: { email: string; name: string | null; photo: string | null; role: string | null };
  bold?: boolean;
  tag?: string;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.5 }]}
      onPress={() =>
        router.push({
          pathname: "/person/[email]",
          params: { email: person.email },
        })
      }
    >
      <Avatar photo={person.photo} name={person.name} size={28} />
      <Txt style={[styles.personName, bold && { fontWeight: "700" }]}>
        {person.name ?? person.email}
      </Txt>
      <Text style={[styles.personMeta, { color: t.muted }]}>
        {tag ?? person.role ?? ""}
        {person.name ? ` • ${person.email}` : ""}
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

  if (!chart) {
    return (
      <Screen>
        <Muted>Loading…</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row>
        <View style={{ flexGrow: 1 }}>
          <SectionTitle>Organisation</SectionTitle>
        </View>
        <YearDropdown
          year={chart.year}
          years={chart.availableYears}
          onSelect={setSelectedYear}
        />
      </Row>

      {chart.director ? (
        <View>
          <Card>
            <Text style={[styles.directorLabel, { color: t.muted }]}>Director</Text>
            <Person person={chart.director} bold tag="Director" />
          </Card>
          <Text style={[styles.connector, { color: t.muted }]}>│</Text>
        </View>
      ) : (
        <Muted>No Director assigned for {chart.year} yet.</Muted>
      )}

      {chart.divisions.map((division) => (
        <View key={division.name}>
          <Txt style={styles.divisionTitle}>{division.name} Division</Txt>
          {division.head ? (
            <Person person={division.head} bold tag="Head of Division" />
          ) : null}
          {division.departments.length === 0 ? (
            <Muted>No departments.</Muted>
          ) : (
            division.departments.map((department) => (
              <View
                key={department.name}
                style={[
                  styles.departmentCard,
                  {
                    backgroundColor: t.card,
                    borderLeftColor: department.colour ?? t.primary,
                  },
                ]}
              >
                <Txt style={styles.departmentName}>{department.name}</Txt>
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
  dropdownButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropdownButtonText: { fontWeight: "700" },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 32,
  },
  dropdownMenu: {
    borderRadius: 12,
    paddingVertical: 4,
    maxWidth: 360,
    width: "100%",
    alignSelf: "center",
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemText: { fontSize: 16 },
  directorLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  connector: { textAlign: "center", fontSize: 18 },
  divisionTitle: { fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 6 },
  departmentCard: {
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 8,
    gap: 6,
  },
  departmentName: { fontSize: 15, fontWeight: "700" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  personName: { fontSize: 14, flexGrow: 1 },
  personMeta: { fontSize: 12 },
});
