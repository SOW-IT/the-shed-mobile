import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  CONSEQUENCE_GUIDE,
  isRiskLevel,
  LIKELIHOOD_GUIDE,
  majorRisks,
  RISK_CATEGORIES,
  RISK_CATEGORY_DESCRIPTIONS,
  RISK_CATEGORY_LABELS,
  RISK_LEVELS,
  RISK_STANDARD_DOWNLOAD_URL,
  RISK_STANDARD_VIEW_URL,
  riskScore,
  rowScore,
  type RiskCategory,
  type RiskData,
  type RiskLevel,
  type RiskRow,
} from "@shared/eventRequests";
import {
  Btn,
  Card,
  Field,
  Muted,
  OptionRow,
  OptionSheet,
  Row,
  SectionTitle,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { RiskRatingPill } from "./EventPills";

/** The Risk form while it's being filled in; each row has a key for the list. */
export type RiskDraft = { noRisks: boolean; risks: (RiskRow & { key: string })[]; contingencies: string };

let nextKey = 0;
const newKey = () => `risk-${nextKey++}`;

export const blankRisk = (): RiskRow & { key: string } => ({ key: newKey(), description: "" });

export const riskDraftFrom = (data: RiskData | undefined): RiskDraft => ({
  noRisks: data?.noRisks ?? false,
  risks: (data?.risks.length ? data.risks : [{ description: "" }]).map((row) => ({
    ...row,
    key: newKey(),
  })),
  contingencies: data?.contingencies ?? "",
});

export const riskDataFrom = (draft: RiskDraft): RiskData => ({
  noRisks: draft.noRisks,
  risks: draft.risks.map(({ key, ...row }) => {
    void key;
    return row;
  }),
  ...(draft.contingencies.trim() ? { contingencies: draft.contingencies } : {}),
});

const openLink = (url: string) => void Linking.openURL(url).catch(() => {});

/** The Standard's links, to read it in full or keep a copy. */
export const RiskStandardLinks = () => (
  <Row>
    <Btn
      title="View the Standard"
      variant="tonal"
      icon="open-outline"
      onPress={() => openLink(RISK_STANDARD_VIEW_URL)}
    />
    <Btn
      title="Download"
      variant="ghost"
      icon="download-outline"
      onPress={() => openLink(RISK_STANDARD_DOWNLOAD_URL)}
    />
  </Row>
);

/** The Standard's matrix: likelihood down the side, consequence along the top. */
const Matrix = () => {
  const t = useAppTheme();
  const colour = (rating: string) =>
    ({
      Low: t.successSoft,
      Moderate: t.primarySoft,
      High: t.warningSoft,
      "Very High": t.dangerSoft,
      Extreme: t.danger,
    })[rating] ?? t.ghost;
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.matrixRow}>
        <View style={styles.matrixLabel} />
        {RISK_LEVELS.map((c) => (
          <Text key={c} style={[styles.matrixHead, { color: t.muted }]}>
            {c}
          </Text>
        ))}
      </View>
      {[...RISK_LEVELS].reverse().map((l) => (
        <View key={l} style={styles.matrixRow}>
          <Text numberOfLines={1} style={[styles.matrixLabel, typography.caption, { color: t.muted }]}>
            {LIKELIHOOD_GUIDE[l].label}
          </Text>
          {RISK_LEVELS.map((c) => {
            const { score, rating } = riskScore(l, c);
            return (
              <View
                key={c}
                style={[styles.matrixCell, { backgroundColor: colour(rating) }]}
                accessible
                accessibilityLabel={`${LIKELIHOOD_GUIDE[l].label}, consequence level ${c}: ${score}, ${rating}`}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: rating === "Extreme" ? "#ffffff" : t.text,
                  }}
                >
                  {score}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <Muted>Across: consequence level 1 (least) to 5 (worst). Down: how likely it is.</Muted>
    </View>
  );
};

/** "How to rate a risk": SOW's Risk Management Standard, folded away until it's wanted. */
export const RiskGuide = () => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.guideHeader}
      >
        <Ionicons name="book-outline" size={18} color={t.primary} />
        <Text style={[typography.headline, { color: t.text, flex: 1 }]}>How to rate a risk</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={t.faint} />
      </Pressable>
      <Muted>From SOW&apos;s Risk Management Standard (2026).</Muted>
      {open ? (
        <View style={{ gap: spacing.md }}>
          <Text style={[typography.body, { color: t.text }]}>
            1. Work out what could go wrong and what kind of risk it is. A fundraiser might carry
            safety and finance risks; a campaign might add a reputational one.{"\n"}
            2. Rate the worst consequence that could reasonably happen, and how likely it is.
            Together they give its score and rating.{"\n"}
            3. For anything above Low, plan how you&apos;ll make it less likely or less harmful
            (e.g. tape down loose cables), and keep an eye on it.
          </Text>
          <SectionTitle>Kinds of risk</SectionTitle>
          {RISK_CATEGORIES.map((c) => (
            <Text key={c} style={[typography.caption, { color: t.text }]}>
              <Text style={{ fontWeight: "700" }}>{RISK_CATEGORY_LABELS[c]}: </Text>
              {RISK_CATEGORY_DESCRIPTIONS[c]}
            </Text>
          ))}
          <SectionTitle>How likely</SectionTitle>
          {[...RISK_LEVELS].reverse().map((l) => (
            <Text key={l} style={[typography.caption, { color: t.text }]}>
              <Text style={{ fontWeight: "700" }}>
                {l}. {LIKELIHOOD_GUIDE[l].label}
              </Text>
              {` (${LIKELIHOOD_GUIDE[l].chance}, ${LIKELIHOOD_GUIDE[l].frequency.toLowerCase()}): ${LIKELIHOOD_GUIDE[l].general}`}
            </Text>
          ))}
          <SectionTitle>Risk matrix</SectionTitle>
          <Matrix />
          <RiskStandardLinks />
        </View>
      ) : null}
    </Card>
  );
};

/** A button showing the chosen level, opening the five levels with what each means. */
const LevelPicker = ({
  label,
  value,
  disabledNote,
  describe,
  onSelect,
}: {
  label: string;
  value: number | undefined;
  disabledNote?: string;
  describe: (level: RiskLevel) => { title: string; detail: string };
  onSelect: (level: RiskLevel) => void;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const chosen = isRiskLevel(value) ? describe(value) : null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <Pressable
        disabled={!!disabledNote}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.title ?? "not picked"}`}
        style={({ pressed }) => [
          styles.picker,
          { backgroundColor: t.inputBackground },
          disabledNote ? { opacity: 0.6 } : null,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[typography.body, { color: chosen ? t.text : t.faint }]}>
            {chosen?.title ?? disabledNote ?? "Pick a level"}
          </Text>
          {chosen ? (
            <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
              {chosen.detail}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={16} color={t.faint} />
      </Pressable>
      <OptionSheet visible={open} title={label} onClose={() => setOpen(false)}>
        {RISK_LEVELS.map((level) => {
          const { title, detail } = describe(level);
          const selected = value === level;
          return (
            <Pressable
              key={level}
              onPress={() => {
                onSelect(level);
                setOpen(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.levelRow,
                selected && { backgroundColor: t.primarySoft },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>{title}</Text>
              <Text style={[typography.caption, { color: t.muted }]}>{detail}</Text>
            </Pressable>
          );
        })}
      </OptionSheet>
    </View>
  );
};

const consequenceOf = (category: RiskCategory | undefined) => (level: RiskLevel) => ({
  title: `Level ${level}`,
  detail: category ? CONSEQUENCE_GUIDE[category][level] : "",
});

const likelihoodOf = (level: RiskLevel) => ({
  title: `${LIKELIHOOD_GUIDE[level].label} (${level})`,
  detail: `${LIKELIHOOD_GUIDE[level].chance}, ${LIKELIHOOD_GUIDE[level].frequency.toLowerCase()}. ${LIKELIHOOD_GUIDE[level].general}`,
});

const RiskRowEditor = ({
  index,
  row,
  onChange,
  onRemove,
}: {
  index: number;
  row: RiskRow;
  onChange: (row: RiskRow) => void;
  onRemove?: () => void;
}) => {
  const t = useAppTheme();
  const [choosingKind, setChoosingKind] = useState(false);
  const score = rowScore(row);
  return (
    <Card>
      <View style={styles.rowHeader}>
        <Text style={[typography.headline, { color: t.text, flex: 1 }]}>Risk {index + 1}</Text>
        {score ? <RiskRatingPill score={score.score} rating={score.rating} /> : null}
      </View>
      <Field
        label="What could go wrong?"
        value={row.description}
        onChangeText={(description) => onChange({ ...row, description })}
        placeholder="e.g. Someone trips on loose cables"
        multiline
        autoCapitalize="sentences"
      />
      <View style={{ gap: 4 }}>
        <Text style={[typography.label, { color: t.muted }]}>What kind of risk?</Text>
        <Pressable
          onPress={() => setChoosingKind(true)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.picker,
            { backgroundColor: t.inputBackground },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[typography.body, { color: row.category ? t.text : t.faint, flex: 1 }]}>
            {row.category ? RISK_CATEGORY_LABELS[row.category] : "Pick a kind"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={t.faint} />
        </Pressable>
        <OptionSheet
          visible={choosingKind}
          title="What kind of risk?"
          onClose={() => setChoosingKind(false)}
        >
          {RISK_CATEGORIES.map((category) => (
            <OptionRow
              key={category}
              label={RISK_CATEGORY_LABELS[category]}
              selected={row.category === category}
              onPress={() => {
                onChange({ ...row, category });
                setChoosingKind(false);
              }}
            />
          ))}
        </OptionSheet>
      </View>
      <LevelPicker
        label="How bad could it be?"
        value={row.consequence}
        disabledNote={row.category ? undefined : "Pick the kind of risk first"}
        describe={consequenceOf(row.category)}
        onSelect={(consequence) => onChange({ ...row, consequence })}
      />
      <LevelPicker
        label="How likely is it?"
        value={row.likelihood}
        describe={likelihoodOf}
        onSelect={(likelihood) => onChange({ ...row, likelihood })}
      />
      <Field
        label={
          score && score.rating !== "Low"
            ? "How will you reduce it? (required)"
            : "How will you reduce it? (optional for Low risks)"
        }
        value={row.mitigation ?? ""}
        onChangeText={(mitigation) => onChange({ ...row, mitigation })}
        placeholder="e.g. Tape cables down and put chairs around them"
        multiline
        autoCapitalize="sentences"
      />
      {onRemove ? <Btn title="Remove This Risk" variant="ghost" icon="trash-outline" onPress={onRemove} /> : null}
    </Card>
  );
};

/** The Risk form: no notable risks, or each risk rated with the Standard's matrix. */
export const RiskFormEditor = ({
  draft,
  onChange,
}: {
  draft: RiskDraft;
  onChange: (draft: RiskDraft) => void;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <RiskGuide />
      <Card>
        <OptionRow
          label="This event has no notable risks"
          multi
          selected={draft.noRisks}
          onPress={() => onChange({ ...draft, noRisks: !draft.noRisks })}
        />
        <Muted>
          {draft.noRisks
            ? "It won't need Compliance's approval, but they'll be told so they can check."
            : "List what could go wrong. Anything rated above Low needs a plan to reduce it."}
        </Muted>
      </Card>
      {draft.noRisks ? null : (
        <>
          {draft.risks.map((row, index) => (
            <RiskRowEditor
              key={row.key}
              index={index}
              row={row}
              onChange={(next) =>
                onChange({
                  ...draft,
                  risks: draft.risks.map((r) => (r.key === row.key ? { ...next, key: row.key } : r)),
                })
              }
              onRemove={
                draft.risks.length > 1
                  ? () => onChange({ ...draft, risks: draft.risks.filter((r) => r.key !== row.key) })
                  : undefined
              }
            />
          ))}
          <Btn
            title="+ Add Another Risk"
            variant="tonal"
            onPress={() => onChange({ ...draft, risks: [...draft.risks, blankRisk()] })}
          />
        </>
      )}
      <Card>
        <Text style={[typography.headline, { color: t.text }]}>Contingencies</Text>
        <Muted>What risks could cost us money, and what&apos;s set aside for them? (optional)</Muted>
        <Field
          value={draft.contingencies}
          onChangeText={(contingencies) => onChange({ ...draft, contingencies })}
          multiline
          autoCapitalize="sentences"
        />
      </Card>
    </View>
  );
};

/** A submitted Risk form, read-only. */
export const RiskView = ({ data, imported }: { data: RiskData; imported: boolean }) => {
  const t = useAppTheme();
  const majors = majorRisks(data);
  return (
    <View style={{ gap: spacing.md }}>
      {data.noRisks ? (
        <Card>
          <Text style={[typography.body, { color: t.text }]}>
            The requester said this event has no notable risks.
          </Text>
        </Card>
      ) : null}
      {!data.noRisks && data.risks.length === 0 ? (
        <Card>
          <Muted>
            {imported
              ? "This event came from the old SHED, which had no Risk form."
              : "No risks have been added yet."}
          </Muted>
        </Card>
      ) : null}
      {majors.length > 0 ? (
        <Card>
          <Text style={[typography.label, { color: t.muted }]}>Major risks considered</Text>
          <Text style={[typography.body, { color: t.text }]}>
            {majors.map((c) => RISK_CATEGORY_LABELS[c]).join(", ")}
          </Text>
        </Card>
      ) : null}
      {data.risks.map((row, index) => {
        const score = rowScore(row);
        return (
          <Card key={index}>
            <View style={styles.rowHeader}>
              <Text style={[typography.headline, { color: t.text, flex: 1 }]}>Risk {index + 1}</Text>
              {score ? <RiskRatingPill score={score.score} rating={score.rating} /> : null}
              {!score && row.legacyRating ? (
                <Text style={[typography.caption, { color: t.muted }]}>Old rating: {row.legacyRating}</Text>
              ) : null}
            </View>
            <Text selectable style={[typography.body, { color: t.text }]}>
              {row.description}
            </Text>
            {row.category ? (
              <Muted>
                {RISK_CATEGORY_LABELS[row.category]}
                {isRiskLevel(row.consequence) ? ` · consequence level ${row.consequence}` : ""}
                {isRiskLevel(row.likelihood) ? ` · ${LIKELIHOOD_GUIDE[row.likelihood].label.toLowerCase()}` : ""}
              </Muted>
            ) : null}
            {row.mitigation ? (
              <Text selectable style={[typography.body, { color: t.text }]}>
                <Text style={{ fontWeight: "700" }}>Plan: </Text>
                {row.mitigation}
              </Text>
            ) : null}
          </Card>
        );
      })}
      {data.contingencies ? (
        <Card>
          <Text style={[typography.label, { color: t.muted }]}>Contingencies</Text>
          <Text selectable style={[typography.body, { color: t.text }]}>
            {data.contingencies}
          </Text>
        </Card>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  guideHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 46,
  },
  levelRow: { gap: 2, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md },
  matrixRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  matrixLabel: { width: 92 },
  matrixHead: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700" },
  matrixCell: {
    flex: 1,
    height: 26,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
