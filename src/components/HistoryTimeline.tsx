import Ionicons from "@expo/vector-icons/Ionicons";
import React, { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatDuration, timelineGapHeight } from "@shared/datetime";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { spacing, typography, useAppTheme, type AppTheme } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = "primary" | "success" | "danger" | "quiet";

export type HistoryEntry = {
  at: number;
  action: string;
  label: string;
  who: string | null;
  detail?: string | null;
};

// How each kind of step looks, across reimbursement, design and event requests.
const LOOKS: Record<string, { icon: IconName; tone: Tone }> = {
  created: { icon: "add", tone: "primary" },
  submitted: { icon: "paper-plane-outline", tone: "primary" },
  edited: { icon: "create-outline", tone: "primary" },
  reopened: { icon: "refresh", tone: "primary" },
  "receipt-submitted": { icon: "receipt-outline", tone: "primary" },
  "auto-approved": { icon: "flash-outline", tone: "success" },
  approved: { icon: "checkmark", tone: "success" },
  "director-approved": { icon: "checkmark", tone: "success" },
  "event-approved": { icon: "checkmark-done", tone: "success" },
  completed: { icon: "checkmark-done", tone: "success" },
  paid: { icon: "cash-outline", tone: "success" },
  declined: { icon: "close", tone: "danger" },
  "changes-requested": { icon: "alert", tone: "danger" },
  "not-required": { icon: "remove", tone: "quiet" },
  cancelled: { icon: "close", tone: "quiet" },
  imported: { icon: "archive-outline", tone: "quiet" },
};

const lookOf = (action: string) => LOOKS[action] ?? { icon: "ellipse-outline" as IconName, tone: "primary" as const };

const toneColour = (t: AppTheme, tone: Tone) =>
  ({ primary: t.primary, success: t.success, danger: t.danger, quiet: t.faint })[tone];

// The space between two steps grows with the time between them, and a gap of
// an hour or more says how long it was.
const Gap = ({ ms }: { ms: number }) => {
  const t = useAppTheme();
  const height = timelineGapHeight(ms);
  if (height === 0) return null;
  return (
    <View style={[styles.gap, { height }]}>
      <View style={styles.railColumn}>
        <View style={[styles.gapRail, { backgroundColor: t.faint }]} />
      </View>
      <Text style={[typography.caption, styles.gapLabel, { color: t.faint }]}>
        {formatDuration(ms)} earlier
      </Text>
    </View>
  );
};

// Newest first, so what happened last is at the top. `pending`, when given,
// sits above it all: what the request is waiting on now.
export const HistoryTimeline = ({
  entries,
  pending,
}: {
  entries: HistoryEntry[];
  pending?: { label: string; note?: ReactNode };
}) => {
  const t = useAppTheme();
  const onCircle = t.dark ? t.background : "#ffffff";
  return (
    <View>
      {pending ? (
        <>
          <View style={styles.row}>
            <View style={styles.railColumn}>
              <View style={[styles.circle, styles.pendingCircle, { borderColor: t.warning }]}>
                <View style={[styles.pendingDot, { backgroundColor: t.warning }]} />
              </View>
              {entries.length > 0 ? <View style={[styles.rail, { backgroundColor: t.faint }]} /> : null}
            </View>
            <View style={styles.content}>
              <Text style={[typography.caption, { color: t.warning, fontWeight: "700" }]}>{pending.label}</Text>
              {pending.note ? <Text style={[typography.caption, { color: t.muted }]}>{pending.note}</Text> : null}
            </View>
          </View>
        </>
      ) : null}
      {entries.map((entry, index) => {
        const look = lookOf(entry.action);
        const older = entries[index + 1];
        return (
          <React.Fragment key={index}>
            <View style={styles.row}>
              <View style={styles.railColumn}>
                <View style={[styles.circle, { backgroundColor: toneColour(t, look.tone) }]}>
                  <Ionicons name={look.icon} size={12} color={onCircle} />
                </View>
                {older ? <View style={[styles.rail, { backgroundColor: t.faint }]} /> : null}
              </View>
              <View style={styles.content}>
                <Text style={[typography.caption, { color: t.text, fontWeight: "700" }]}>{entry.label}</Text>
                <Text style={[typography.caption, { color: t.muted }]}>
                  {entry.who ? `${entry.who} · ` : ""}
                  {sydneyDateTime(entry.at)}
                </Text>
                {entry.detail ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: look.tone === "danger" ? t.danger : t.muted, fontStyle: "italic" },
                    ]}
                  >
                    {entry.detail}
                  </Text>
                ) : null}
              </View>
            </View>
            {older ? <Gap ms={entry.at - older.at} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
};

const RAIL_WIDTH = 22;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm, alignItems: "stretch" },
  railColumn: { width: RAIL_WIDTH, alignItems: "center" },
  circle: {
    width: RAIL_WIDTH,
    height: RAIL_WIDTH,
    borderRadius: RAIL_WIDTH / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingCircle: { backgroundColor: "transparent", borderWidth: 1.5 },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  rail: { flex: 1, width: 2, borderRadius: 1, marginTop: 2, minHeight: 8, opacity: 0.4 },
  content: { flex: 1, gap: 1, paddingBottom: spacing.sm },
  gap: { flexDirection: "row", gap: spacing.sm },
  gapRail: { flex: 1, width: 2, borderRadius: 1, opacity: 0.4 },
  gapLabel: { alignSelf: "center" },
});
