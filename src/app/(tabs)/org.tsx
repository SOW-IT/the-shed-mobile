import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { togglePicked } from "../../../shared/churches";
import { universityColour } from "../../../shared/flow";
import { departmentHeadTitle, filterOrgChart } from "../../../shared/orgChart";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { ChromeScreen } from "@/components/ChromeScreen";
import { FilterChip, FilterRow } from "@/components/FilterChips";
import {
  Avatar,
  Btn,
  FadeInView,
  FloatingYearPicker,
  Grid,
  LoadingState,
  Muted,
  ReadableColumn,
  SearchField,
  stagger,
  Txt,
} from "@/components/ui";

const ORG_CARD_WIDTH = 340;

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
      testID="org-person"
      accessibilityRole="button"
      accessibilityLabel={[person.name ?? person.email, tag ?? person.role]
        .filter(Boolean)
        .join(", ")}
      style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.5 }]}
      onPress={() =>
        router.push({ pathname: "/person/[email]", params: { email: person.email } })
      }
    >
      <Avatar photo={person.photo} name={person.name} size={size} />
      <Txt style={[styles.personName, bold && styles.personNameBold]} numberOfLines={1}>
        {person.name ?? person.email}
      </Txt>
      <Text style={[typography.caption, styles.personTag, { color: t.faint }]} numberOfLines={2}>
        {tag ?? person.role ?? ""}
      </Text>
    </Pressable>
  );
};

export default function OrgChartScreen() {
  const t = useAppTheme();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const chart = useQuery(
    api.directory.orgChart,
    selectedYear === null ? {} : { year: selectedYear }
  );

  if (!chart) {
    return (
      <ChromeScreen>
        <LoadingState />
      </ChromeScreen>
    );
  }

  const { areas, active, counts, shown, people } = filterOrgChart(chart, search, picked);
  const filtering = active.length > 0;
  const searching = search.trim() !== "";
  const campuses = shown.universities.filter((u) => u.members.length > 0);
  const showEveryone = () => {
    setPicked([]);
    setSearch("");
  };

  return (
    <ChromeScreen
      fullWidth
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
      <ReadableColumn>
        <View style={styles.finder}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search people, roles or teams" />
          {areas.length > 1 ? (
            <FilterRow title="Teams and campuses">
              {areas.map((area) => (
                <FilterChip
                  key={area.key}
                  on={active.includes(area.key)}
                  label={area.label}
                  count={counts.get(area.key) ?? 0}
                  colour={area.kind === "campus" ? universityColour(area.name) : undefined}
                  onPress={() => setPicked((prev) => togglePicked(prev, area.key))}
                />
              ))}
            </FilterRow>
          ) : null}
          <View style={[styles.summary, { borderTopColor: t.separator }]}>
            <Text style={[typography.caption, { color: t.muted, flex: 1 }]} accessibilityLiveRegion="polite">
              {people === 1 ? "1 person" : `${people} people`}
            </Text>
            {filtering || searching ? (
              <Pressable
                accessibilityRole="button"
                onPress={showEveryone}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={[typography.caption, { color: t.primary, fontWeight: "700" }]}>Show everyone</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ReadableColumn>

      {shown.director ? (
        <FadeInView delay={40}>
          <ReadableColumn maxWidth={ORG_CARD_WIDTH}>
            <View style={[styles.directorCard, t.surfaceEdge, { backgroundColor: t.card }]}>
              <Person person={shown.director} bold tag={shown.director.role ?? "Director"} size={46} />
            </View>
          </ReadableColumn>
        </FadeInView>
      ) : filtering || searching ? null : (
        <Muted>No Director assigned for {chart.year} yet.</Muted>
      )}

      {(filtering || searching) && people === 0 ? (
        <View style={styles.nothing}>
          <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>
            {searching ? "Nobody matches that search." : "Nobody matches these filters."}
          </Text>
          <Btn title="Show everyone" variant="ghost" onPress={showEveryone} />
        </View>
      ) : null}

      {shown.staff.length > 0 && (
        <FadeInView delay={stagger(1)}>
          <View style={styles.divisionBlock}>
            <Text style={[typography.label, styles.centerLabel, { color: t.muted }]}>
              Staff
            </Text>
            <ReadableColumn maxWidth={ORG_CARD_WIDTH}>
              <View
                style={[
                  styles.deptCard,
                  t.surfaceEdge,
                  { backgroundColor: t.card, borderLeftColor: t.primary },
                ]}
              >
                {shown.staff.map((member) => (
                  <Person key={member.email} person={member} />
                ))}
              </View>
            </ReadableColumn>
          </View>
        </FadeInView>
      )}

      {shown.divisions.map((division, divisionIndex) => (
        <FadeInView key={division.name} delay={stagger(divisionIndex + 2)}>
          <View style={styles.divisionBlock}>
            <Text style={[typography.label, styles.centerLabel, { color: t.muted }]}>
              {division.name}
            </Text>

            {division.head ? (
              <ReadableColumn maxWidth={ORG_CARD_WIDTH}>
                <View style={[styles.divisionHeadRow, t.surfaceEdge, { backgroundColor: t.card }]}>
                  <Person
                    person={division.head}
                    bold
                    tag={division.head.role ?? "Head of Division"}
                    size={34}
                  />
                </View>
              </ReadableColumn>
            ) : null}

            {division.departments.length === 0 ? (
              searching ? null : <Muted>No departments.</Muted>
            ) : (
              <Grid fixedWidth={ORG_CARD_WIDTH}>
                {division.departments.map((dept) => (
                  <View
                    key={dept.name}
                    style={[
                      styles.deptCard,
                      t.surfaceEdge,
                      { backgroundColor: t.card, borderLeftColor: dept.colour ?? t.primary },
                    ]}
                  >
                    <Text style={[typography.label, { color: t.faint }]}>{dept.name}</Text>
                    {dept.head ? (
                      <Person
                        person={dept.head}
                        bold
                        tag={departmentHeadTitle(chart.roleTitles)}
                      />
                    ) : null}
                    {dept.members.map((member) => (
                      <Person key={member.email} person={member} />
                    ))}
                    {dept.members.length === 0 && !dept.head ? (
                      <Muted>No members yet</Muted>
                    ) : null}
                  </View>
                ))}
              </Grid>
            )}
          </View>
        </FadeInView>
      ))}

      {campuses.length > 0 && (
        <FadeInView delay={stagger(shown.divisions.length + 2)}>
          <View style={styles.divisionBlock}>
            <Text style={[typography.label, styles.centerLabel, { color: t.muted }]}>
              Campus
            </Text>
            <Grid fixedWidth={ORG_CARD_WIDTH}>
              {campuses.map((u) => (
                <View
                  key={u.name}
                  style={[
                    styles.deptCard,
                    t.surfaceEdge,
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
            </Grid>
          </View>
        </FadeInView>
      )}
    </ChromeScreen>
  );
}

const styles = StyleSheet.create({
  finder: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nothing: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
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
  centerLabel: {
    textAlign: "center",
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
