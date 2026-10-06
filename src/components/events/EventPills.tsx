import { StyleSheet, Text, View } from "react-native";
import {
  EVENT_STATUS_LABELS,
  SUB_FORM_STATUS_LABELS,
  type EventRequestStatus,
  type RiskRating,
  type SubFormStatus,
} from "@shared/eventRequests";
import { radius, useAppTheme, type AppTheme } from "@/theme";

type Tone = "waiting" | "done" | "problem" | "quiet" | "info";

const toneColours = (t: AppTheme, tone: Tone) => {
  switch (tone) {
    case "waiting":
      return { bg: t.warningSoft, fg: t.dark ? t.warning : t.text };
    case "done":
      return { bg: t.successSoft, fg: t.success };
    case "problem":
      return { bg: t.dangerSoft, fg: t.danger };
    case "info":
      return { bg: t.primarySoft, fg: t.dark ? t.text : t.primary };
    case "quiet":
      return { bg: t.ghost, fg: t.muted };
  }
};

const EVENT_TONES: Record<EventRequestStatus, Tone> = {
  IN_PROGRESS: "waiting",
  APPROVED: "done",
  CANCELLED: "quiet",
};

export const SUB_FORM_TONES: Record<SubFormStatus, Tone> = {
  DRAFT: "quiet",
  PENDING: "waiting",
  CHANGES_REQUESTED: "problem",
  APPROVED: "done",
  NOT_REQUIRED: "info",
};

const RATING_TONES: Record<RiskRating, Tone> = {
  Low: "done",
  Moderate: "info",
  High: "waiting",
  "Very High": "problem",
  Extreme: "problem",
};

/** The colour a status dot uses, for compact step markers. */
export const toneColour = (t: AppTheme, tone: Tone) => toneColours(t, tone).fg;

export const Pill = ({ label, tone }: { label: string; tone: Tone }) => {
  const t = useAppTheme();
  const { bg, fg } = toneColours(t, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text numberOfLines={1} style={[styles.text, { color: fg }]}>
        {label}
      </Text>
    </View>
  );
};

export const EventStatusPill = ({ status }: { status: EventRequestStatus }) => (
  <Pill label={EVENT_STATUS_LABELS[status]} tone={EVENT_TONES[status]} />
);

export const SubFormStatusPill = ({ status }: { status: SubFormStatus }) => (
  <Pill label={SUB_FORM_STATUS_LABELS[status]} tone={SUB_FORM_TONES[status]} />
);

/** "14 · High": a risk's score and rating from the matrix. */
export const RiskRatingPill = ({ score, rating }: { score?: number; rating: RiskRating }) => (
  <Pill label={score === undefined ? rating : `${score} · ${rating}`} tone={RATING_TONES[rating]} />
);

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: "700" },
});
