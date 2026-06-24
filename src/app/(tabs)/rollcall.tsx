import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { staffYearForDate } from "../../../shared/flow";
import { ALL_SUBGROUP, subgroupLabel } from "../../../shared/rollcall";
import {
  Card,
  EmptyState,
  FadeInView,
  LoadingState,
  Muted,
  Screen,
  stagger,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/**
 * The roll-call tab root: SOW's sub-groups for the current staff year — the
 * synthetic "ALL" plus every campus, drawn straight from the universities
 * table. Tapping one opens its events.
 */
export default function RollCallScreen() {
  const t = useAppTheme();
  const router = useRouter();
  const year = staffYearForDate(new Date());
  const subgroups = useQuery(api.events.subgroups, { year });

  if (subgroups === undefined) return <LoadingState />;

  return (
    <Screen title="Roll-call" subtitle={`SOW · ${year}`}>
      {subgroups.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No sub-groups yet"
          message="Campuses are read from this year's universities. Add one in the admin area to start taking roll-call."
        />
      ) : (
        subgroups.map((subgroup, i) => (
          <FadeInView key={subgroup} delay={stagger(i)}>
            <Card style={{ marginBottom: spacing.sm }}>
              <Pressable
                style={({ pressed }) => [
                  { flexDirection: "row", alignItems: "center", gap: 12 },
                  pressed && { opacity: 0.6 },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/rollcall/[subgroup]",
                    params: { subgroup },
                  })
                }
              >
                <Ionicons
                  name={subgroup === ALL_SUBGROUP ? "globe-outline" : "school-outline"}
                  size={22}
                  color={t.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[typography.headline, { color: t.text }]}>
                    {subgroupLabel(subgroup)}
                  </Text>
                  {subgroup !== ALL_SUBGROUP ? <Muted>{subgroup}</Muted> : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color={t.faint} />
              </Pressable>
            </Card>
          </FadeInView>
        ))
      )}
    </Screen>
  );
}
