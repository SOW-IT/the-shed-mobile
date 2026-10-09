import { useMutation } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { sydneyCalendarYear, SYDNEY_TIME_ZONE } from "@shared/flow";
import type { NameMatch } from "@shared/mergeSuggestions";
import { MergeMemberSheet } from "@/components/attendance/MergeMemberSheet";
import {
  Btn,
  Card,
  ConfirmDialog,
  Grid,
  Muted,
  ReadableColumn,
  Row,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type Suggestion = NonNullable<
  FunctionReturnType<typeof api.mergeSuggestions.list>
>[number];
type Candidate = Suggestion["candidates"][number];

const MATCH_LABELS: Record<NameMatch, string> = {
  same: "Same name",
  spacing: "Same name, spaced differently",
  order: "Same name, in another order",
  middle: "Same name, with a middle name",
  short: "Shortened first name",
};

const signInLine = (c: Candidate) =>
  c.signIns === 0
    ? "No sign-ins"
    : `${c.signIns} sign-in${c.signIns === 1 ? "" : "s"} · last ${new Date(
        c.lastSignIn!
      ).toLocaleDateString("en-AU", {
        timeZone: SYDNEY_TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`;

type MergeTarget = {
  memberId: Id<"attendanceMembers">;
  memberEmail?: string;
  staff: { email: string; name: string };
};
type NotSameTarget = { staffEmail: string; staffName: string; candidate: Candidate };

/**
 * Admin → Merges: staff who look like someone still in attendance as a
 * member. Merge opens the usual member → staff merge review; "Not the same"
 * stops the pair being suggested. The tab only shows while there are any.
 */
export function SuggestedMerges({
  suggestions,
  staffYear,
  run,
  onMerged,
}: {
  suggestions: Suggestion[];
  staffYear: number;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  onMerged: (summary: string) => void;
}) {
  const t = useAppTheme();
  const dismiss = useMutation(api.mergeSuggestions.dismiss);
  // Kept after the sheet closes so it can animate out with its content.
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [notSame, setNotSame] = useState<NotSameTarget | null>(null);

  return (
    <>
      <ReadableColumn>
        <Muted>
          These staff look like people already signed in as members. Merging moves the
          member&apos;s sign-ins onto the staff person, so attendance and Insights count
          them once. Nothing changes until you merge.
        </Muted>
      </ReadableColumn>
      <Grid fixedWidth={360} align="start">
        {suggestions.map((s) => (
          <Card key={s.staffEmail}>
            <Text style={[typography.label, { color: t.muted }]}>STAFF</Text>
            <Txt style={{ fontWeight: "600" }}>{s.staffName}</Txt>
            <Muted>{[...s.roles, ...s.universities].join(" · ") || "Staff"}</Muted>
            <Muted>{s.staffEmail}</Muted>
            {s.candidates.map((c, i) => (
              <View
                key={c.memberId}
                style={[styles.candidate, { borderTopColor: t.separator }]}
              >
                {i === 0 ? (
                  <Text style={[typography.label, { color: t.muted }]}>
                    {s.candidates.length === 1
                      ? "IN ATTENDANCE AS A MEMBER"
                      : `IN ATTENDANCE AS ${s.candidates.length} MEMBERS`}
                  </Text>
                ) : null}
                <View>
                  <Txt style={{ fontWeight: "600" }}>{c.name}</Txt>
                  <Muted>
                    {[c.campus, c.role, MATCH_LABELS[c.match]].filter(Boolean).join(" · ")}
                  </Muted>
                  <Muted>{signInLine(c)}</Muted>
                </View>
                <Row>
                  <Btn
                    title="Merge"
                    icon="git-merge-outline"
                    variant="tonal"
                    onPress={() => {
                      setMergeTarget({
                        memberId: c.memberId,
                        memberEmail: c.email,
                        staff: { email: s.staffEmail, name: s.staffName },
                      });
                      setMergeOpen(true);
                    }}
                  />
                  <Btn
                    title="Not the same"
                    variant="ghost"
                    onPress={() =>
                      setNotSame({ staffEmail: s.staffEmail, staffName: s.staffName, candidate: c })
                    }
                  />
                </Row>
              </View>
            ))}
          </Card>
        ))}
      </Grid>
      {mergeTarget ? (
        <MergeMemberSheet
          visible={mergeOpen}
          onClose={() => setMergeOpen(false)}
          onMerged={onMerged}
          memberId={mergeTarget.memberId}
          memberEmail={mergeTarget.memberEmail}
          isStaff={false}
          year={sydneyCalendarYear(new Date())}
          staffYear={staffYear}
          initialStaff={mergeTarget.staff}
        />
      ) : null}
      <ConfirmDialog
        visible={notSame !== null}
        title="Not the same person?"
        message={
          notSame
            ? `The member "${notSame.candidate.name}"${
                notSame.candidate.campus ? ` (${notSame.candidate.campus})` : ""
              } won't be suggested for staff ${notSame.staffName} again. Their attendance stays as it is.`
            : undefined
        }
        destructive={false}
        confirmLabel="Not the same"
        onConfirm={() => {
          if (notSame) {
            void run(() =>
              dismiss({ staffEmail: notSame.staffEmail, memberId: notSame.candidate.memberId })
            );
          }
        }}
        onClose={() => setNotSame(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  candidate: {
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
