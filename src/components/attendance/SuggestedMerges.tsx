import { useMutation } from "convex/react";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { sydneyCalendarYear } from "@shared/flow";
import type { NameMatch } from "@shared/mergeSuggestions";
import { MergeMemberSheet } from "@/components/attendance/MergeMemberSheet";
import {
  Btn,
  Card,
  ConfirmDialog,
  Grid,
  Muted,
  Row,
  SectionTitle,
  Txt,
} from "@/components/ui";
import { sydneyDay } from "@/lib/sydneyTime";
import { spacing, typography, useAppTheme } from "@/theme";

type Suggestion = NonNullable<
  FunctionReturnType<typeof api.mergeSuggestions.list>
>[number];
type Candidate = Suggestion["candidates"][number];
type MemberPair = NonNullable<
  FunctionReturnType<typeof api.memberPairSuggestions.list>
>[number];

const MATCH_LABELS: Record<NameMatch, string> = {
  same: "Same name",
  spacing: "Same name, spaced differently",
  order: "Same name, in another order",
  middle: "Same name, with a middle name",
  short: "Shortened first name",
  typo: "One letter different",
};

const signInLine = (c: { signIns: number; lastSignIn: number | null }) =>
  c.signIns === 0
    ? "No sign-ins"
    : `${c.signIns} sign-in${c.signIns === 1 ? "" : "s"} · last ${sydneyDay(c.lastSignIn!)}`;

type MergeTarget = {
  memberId: Id<"attendanceMembers">;
  memberEmail?: string;
  staff?: { email: string; name: string };
  member?: { memberId: Id<"attendanceMembers">; name: string; email?: string };
};
type NotSameTarget =
  | { kind: "staff"; staffEmail: string; staffName: string; candidate: Candidate }
  | { kind: "pair"; pair: MemberPair };

const notSameMessage = (target: NotSameTarget): string =>
  target.kind === "staff"
    ? `The member "${target.candidate.name}"${
        target.candidate.campus ? ` (${target.candidate.campus})` : ""
      } won't be suggested for staff ${target.staffName} again. Their attendance stays as it is.`
    : `"${target.pair.a.name}" and "${target.pair.b.name}" won't be suggested as the same person again. Their attendance stays as it is.`;

export function SuggestedMerges({
  suggestions,
  memberPairs,
  staffYear,
  run,
  onMerged,
}: {
  suggestions: Suggestion[];
  memberPairs: MemberPair[];
  staffYear: number;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  onMerged: (summary: string) => void;
}) {
  const t = useAppTheme();
  const dismiss = useMutation(api.mergeSuggestions.dismiss);
  const dismissPair = useMutation(api.memberPairSuggestions.dismiss);
  const [mergeTarget, setMergeTarget] = useState<MergeTarget | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [notSame, setNotSame] = useState<NotSameTarget | null>(null);

  const openMerge = (target: MergeTarget) => {
    setMergeTarget(target);
    setMergeOpen(true);
  };

  const confirmNotSame = (target: NotSameTarget) =>
    target.kind === "staff"
      ? dismiss({ staffEmail: target.staffEmail, memberId: target.candidate.memberId })
      : dismissPair({ memberA: target.pair.a.memberId, memberB: target.pair.b.memberId });

  return (
    <>
      {suggestions.length > 0 ? (
        <>
          <SectionTitle>Staff who look like a member</SectionTitle>
          <Grid fixedWidth={360} align="start">
            {suggestions.map((s) => (
              <Card key={s.staffEmail}>
                <Text style={[typography.label, { color: t.muted }]}>Staff</Text>
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
                          ? "In attendance as a member"
                          : `In attendance as ${s.candidates.length} members`}
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
                        onPress={() =>
                          openMerge({
                            memberId: c.memberId,
                            memberEmail: c.email,
                            staff: { email: s.staffEmail, name: s.staffName },
                          })
                        }
                      />
                      <Btn
                        title="Not the same"
                        variant="ghost"
                        onPress={() =>
                          setNotSame({
                            kind: "staff",
                            staffEmail: s.staffEmail,
                            staffName: s.staffName,
                            candidate: c,
                          })
                        }
                      />
                    </Row>
                  </View>
                ))}
              </Card>
            ))}
          </Grid>
        </>
      ) : null}
      {memberPairs.length > 0 ? (
        <>
          <SectionTitle>Members who may be the same person</SectionTitle>
          <Grid fixedWidth={360} align="start">
            {memberPairs.map((p) => (
              <Card key={p.id}>
                <Text style={[typography.label, { color: t.muted }]}>{MATCH_LABELS[p.match]}</Text>
                {[p.a, p.b].map((m, i) => (
                  <View
                    key={m.memberId}
                    style={i === 0 ? undefined : [styles.candidate, { borderTopColor: t.separator }]}
                  >
                    <Txt style={{ fontWeight: "600" }}>{m.name}</Txt>
                    <Muted>{[m.campus, m.role].filter(Boolean).join(" · ") || "No campus"}</Muted>
                    {m.email ? <Muted>{m.email}</Muted> : null}
                    <Muted>{signInLine(m)}</Muted>
                  </View>
                ))}
                <Row>
                  <Btn
                    title="Merge"
                    icon="git-merge-outline"
                    variant="tonal"
                    onPress={() =>
                      openMerge({
                        memberId: p.a.memberId,
                        memberEmail: p.a.email,
                        member: { memberId: p.b.memberId, name: p.b.name, email: p.b.email },
                      })
                    }
                  />
                  <Btn
                    title="Not the same"
                    variant="ghost"
                    onPress={() => setNotSame({ kind: "pair", pair: p })}
                  />
                </Row>
              </Card>
            ))}
          </Grid>
        </>
      ) : null}
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
          initialMember={mergeTarget.member}
        />
      ) : null}
      <ConfirmDialog
        visible={notSame !== null}
        title="Not the same person?"
        message={notSame ? notSameMessage(notSame) : undefined}
        destructive={false}
        confirmLabel="Not the same"
        onConfirm={() => {
          if (notSame) void run(() => confirmNotSame(notSame));
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
