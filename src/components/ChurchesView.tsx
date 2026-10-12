import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { subgroupLabel } from "../../shared/rollcall";
import { ChromeScreen } from "./ChromeScreen";
import { type Church, ChurchDetails, ChurchForm } from "./ChurchPicker";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { Btn, Card, EmptyState, FadeInView, LoadingState, SearchField, stagger } from "./ui";

/**
 * The Churches page: every church staff and members go to, where it meets and
 * when, and who goes there. Staff pick theirs in their Profile; a member's is
 * set when editing their attendance record.
 */
export function ChurchesView() {
  const t = useAppTheme();
  const router = useRouter();
  const directory = useQuery(api.churches.directory);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{ church: Church | null } | null>(null);

  const q = search.trim().toLowerCase();
  const shown = (directory ?? []).filter(
    (entry) =>
      !q ||
      entry.church.name.toLowerCase().includes(q) ||
      entry.staff.some((p) => p.name.toLowerCase().includes(q)) ||
      entry.members.some((p) => p.name.toLowerCase().includes(q))
  );

  return (
    <ChromeScreen>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.largeTitle, { color: t.text }]}>Churches</Text>
          <Text style={[typography.caption, { color: t.muted }]}>
            Where staff and members go to church
          </Text>
        </View>
        <Btn title="Add a church" icon="add" variant="tonal" onPress={() => setForm({ church: null })} />
      </View>
      {directory === undefined ? (
        <LoadingState />
      ) : directory.length === 0 ? (
        <EmptyState icon="business-outline" title="No churches yet" message="Add the first one." />
      ) : (
        <>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search churches or people" />
          {shown.map((entry, index) => {
            const people = entry.staff.length + entry.members.length;
            return (
              <FadeInView key={entry.church._id} delay={stagger(index)}>
                <Card style={{ gap: spacing.sm }}>
                  <ChurchDetails church={entry.church} onEdit={() => setForm({ church: entry.church })} />
                  {people === 0 ? (
                    <Text style={[typography.caption, { color: t.muted }]}>Nobody has picked it yet.</Text>
                  ) : null}
                  {entry.staff.length > 0 ? (
                    <View>
                      <Text style={[styles.groupTitle, { color: t.muted }]}>
                        Staff <Text style={{ color: t.faint }}>{entry.staff.length}</Text>
                      </Text>
                      {entry.staff.map((person) => (
                        <Pressable
                          key={person.email}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${person.name}`}
                          onPress={() =>
                            router.push({ pathname: "/person/[email]", params: { email: person.email } })
                          }
                          style={({ pressed }) => [
                            styles.person,
                            { borderTopColor: t.separator },
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[typography.body, { color: t.text, flex: 1 }]}>{person.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {entry.members.length > 0 ? (
                    <View>
                      <Text style={[styles.groupTitle, { color: t.muted }]}>
                        Members <Text style={{ color: t.faint }}>{entry.members.length}</Text>
                      </Text>
                      {entry.members.map((person) => (
                        <View key={person.memberId} style={[styles.person, { borderTopColor: t.separator }]}>
                          <Text style={[typography.body, { color: t.text, flex: 1 }]}>{person.name}</Text>
                          {person.campus ? (
                            <View style={[styles.campus, { backgroundColor: t.ghost }]}>
                              <Text style={[typography.caption, { color: t.ghostText, fontWeight: "700" }]}>
                                {subgroupLabel(person.campus)}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </FadeInView>
            );
          })}
          {shown.length === 0 ? (
            <Text style={[typography.caption, { color: t.muted, textAlign: "center" }]}>Nothing matches.</Text>
          ) : null}
        </>
      )}
      <ChurchForm
        visible={form !== null}
        church={form?.church ?? null}
        onClose={() => setForm(null)}
        onSaved={() => setForm(null)}
      />
    </ChromeScreen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md, flexWrap: "wrap" },
  groupTitle: { fontSize: 13, fontWeight: "700", marginTop: spacing.xs, marginBottom: spacing.xs },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  campus: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
});
