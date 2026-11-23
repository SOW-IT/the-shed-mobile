import type { FunctionReturnType } from "convex/server";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { api } from "../../convex/_generated/api";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { NoMatches } from "@/components/FilterChips";
import { Avatar, Chip, Txt } from "@/components/ui";

type OrgSearch = FunctionReturnType<typeof api.orgSearch.searchAllYears>;
export type OrgSearchResult = OrgSearch["results"][number];

export function OrgSearchResults({
  found,
  onOpen,
}: {
  found: OrgSearch;
  onOpen: (result: OrgSearchResult) => void;
}) {
  const t = useAppTheme();
  if (found.results.length === 0) {
    return <NoMatches message="Nobody matches that search in any year." />;
  }
  return (
    <View style={styles.list}>
      {found.results.map((result) => (
        <Pressable
          key={`${result.year}:${result.email}`}
          testID="org-search-result"
          accessibilityRole="button"
          accessibilityLabel={[result.name ?? result.email, String(result.year), ...result.roles].join(", ")}
          accessibilityHint={`Opens the ${result.year} org chart`}
          onPress={() => onOpen(result)}
          style={({ pressed }) => [
            styles.row,
            t.surfaceEdge,
            { backgroundColor: t.card },
            pressed && { opacity: 0.5 },
          ]}
        >
          <Avatar photo={result.photo} name={result.name} size={36} />
          <View style={styles.text}>
            <Txt style={styles.name} numberOfLines={1}>
              {result.name ?? result.email}
            </Txt>
            {result.roles.map((role) => (
              <Text key={role} style={[typography.caption, { color: t.muted }]} numberOfLines={2}>
                {role}
              </Text>
            ))}
          </View>
          <Chip>{result.year}</Chip>
        </Pressable>
      ))}
      {found.more ? (
        <Text style={[typography.caption, styles.more, { color: t.faint }]}>
          More people may match. Add another word, or more of a name, to narrow it down.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md - 2,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
  },
  more: {
    textAlign: "center",
    paddingTop: spacing.sm,
  },
});
