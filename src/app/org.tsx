import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "@/theme";
import { Avatar, Muted, Screen, Txt } from "@/components/ui";

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
        style={[styles.yearPill, { backgroundColor: t.card, borderColor: t.border }]}
        onPress={() => setOpen(true)}
      >
        <Txt style={styles.yearPillText}>{year} ▾</Txt>
      </Pressable>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.dropdownMenu, { backgroundColor: t.card }]}>
            <ScrollView>
              {years.map((y) => (
                <Pressable
                  key={y}
                  style={[styles.dropdownItem, y === year && { backgroundColor: t.ghost }]}
                  onPress={() => {
                    onSelect(y);
                    setOpen(false);
                  }}
                >
                  <Txt style={[styles.dropdownItemText, y === year && { fontWeight: "700" }]}>
                    {y}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

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
      <Text style={[styles.personTag, { color: t.muted }]} numberOfLines={1}>
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

  if (!chart) {
    return (
      <Screen>
        <Muted>Loading…</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Page header */}
      <View style={styles.pageHeader}>
        <Txt style={styles.pageTitle}>Organisation</Txt>
        <YearDropdown
          year={chart.year}
          years={chart.availableYears}
          onSelect={setSelectedYear}
        />
      </View>

      {/* Director */}
      {chart.director ? (
        <View style={[styles.directorCard, { backgroundColor: t.card, borderColor: t.border }]}>
          <Person person={chart.director} bold tag="Director" size={46} />
        </View>
      ) : (
        <Muted>No Director assigned for {chart.year} yet.</Muted>
      )}

      {/* Divisions */}
      {chart.divisions.map((division) => (
        <View key={division.name} style={styles.divisionBlock}>
          {/* Division label */}
          <Txt style={[styles.divisionTitle, { color: t.text }]}>
            {division.name} Division
          </Txt>

          {/* Head of Division — contained row */}
          {division.head ? (
            <View style={[styles.divisionHeadRow, { backgroundColor: t.card, borderColor: t.border }]}>
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
                  { backgroundColor: t.card, borderLeftColor: dept.colour ?? t.primary },
                ]}
              >
                <Txt style={[styles.deptName, { color: t.text }]}>{dept.name}</Txt>
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
      ))}

      {/* Campus */}
      {chart.universities.some((u) => u.members.length > 0) && (
        <View style={styles.divisionBlock}>
          <Txt style={[styles.divisionTitle, { color: t.text }]}>Campus</Txt>
          {chart.universities
            .filter((u) => u.members.length > 0)
            .map((u) => (
              <View
                key={u.name}
                style={[styles.deptCard, { backgroundColor: t.card, borderLeftColor: t.primary }]}
              >
                <Txt style={[styles.deptName, { color: t.text }]}>{u.name}</Txt>
                {u.members.map((member) => (
                  <Person key={member.email} person={member} />
                ))}
              </View>
            ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    flexGrow: 1,
  },
  yearPill: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  yearPillText: {
    fontWeight: "700",
    fontSize: 15,
  },
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
    maxHeight: 320,
    width: "100%",
    alignSelf: "center",
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownItemText: { fontSize: 16 },
  directorCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  divisionBlock: {
    marginBottom: 24,
    gap: 8,
  },
  divisionTitle: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  divisionHeadRow: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deptCard: {
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  deptName: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
    fontSize: 12,
    textAlign: "right",
  },
});
