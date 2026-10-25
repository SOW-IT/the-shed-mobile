import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { matchesSearch } from "@shared/mentoring";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FloatingYearPicker,
  FooterAction,
  InfoBanner,
  LoadingState,
  Muted,
  OptionSheet,
  Screen,
  SearchField,
  Toast,
  type ToastState,
} from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  type ExternalMentor,
  ExternalMentorSheet,
  type MentorChoice,
  MenteePicker,
  MentorPicker,
  PersonLine,
} from "@/components/mentoring/MentoringParts";
import { sydneyDateTime } from "@/lib/sydneyTime";
import { durations, spacing, useAppTheme } from "@/theme";

const afterSheetCloses = (open: () => void) => setTimeout(open, durations.overlayOut + 80);

type Pairing = NonNullable<FunctionReturnType<typeof api.mentoring.pairings>>["pairs"][number];
type MentoringTab = "pairings" | "externals" | "mine";

type Picking =
  | { step: "mentee" }
  | { step: "mentor"; mentee: { email: string; name: string } }
  | null;

const PairingCard = ({ pair, onPress }: { pair: Pairing; onPress: () => void }) => {
  const t = useAppTheme();
  const menteeTags = pair.mentee.warning ? [{ text: pair.mentee.warning, tone: "warning" as const }] : [];
  const mentorTags = [
    ...(pair.mentor.kind === "external" ? [{ text: "External", tone: "neutral" as const }] : []),
    ...(pair.mentor.warning ? [{ text: pair.mentor.warning, tone: "warning" as const }] : []),
  ];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${pair.mentee.name}, mentored by ${pair.mentor.name}`}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <Card style={styles.pairCard}>
        <PersonLine
          name={pair.mentee.name}
          line={pair.mentee.line}
          photo={pair.mentee.photo}
          tags={menteeTags}
        />
        <View style={styles.mentorRow}>
          <Ionicons name="return-down-forward" size={18} color={t.faint} style={styles.mentorIcon} />
          <View style={{ flex: 1 }}>
            <PersonLine
              name={pair.mentor.name}
              line={pair.mentor.line}
              photo={pair.mentor.photo}
              tags={mentorTags}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
};

export default function MentoringScreen() {
  const me = useQuery(api.directory.me);
  const isAdmin = !!me?.isAdmin;
  const isStaff = !!me?.profile;
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? currentYear;
  const editable = selectedYear === currentYear || selectedYear === currentYear + 1;

  const mine = useQuery(api.mentoring.myMentees, isStaff ? {} : "skip");
  const years = useQuery(api.directory.availableYears, isAdmin ? {} : "skip");
  const pairings = useQuery(api.mentoring.pairings, isAdmin ? { year: selectedYear } : "skip");
  const candidates = useQuery(
    api.mentoring.candidates,
    isAdmin ? { year: editable ? selectedYear : currentYear } : "skip"
  );
  const externals = useQuery(api.mentoring.externalMentors, isAdmin ? {} : "skip");
  const setMentor = useMutation(api.mentoring.setMentor);
  const removePairing = useMutation(api.mentoring.removePairing);

  const [tab, setTab] = useState<MentoringTab>("pairings");
  const [search, setSearch] = useState("");
  const [externalSearch, setExternalSearch] = useState("");
  const [picking, setPicking] = useState<Picking>(null);
  const [opened, setOpened] = useState<Pairing | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<Pairing | null>(null);
  const [externalSheet, setExternalSheet] = useState<{
    key: number;
    editing: ExternalMentor | null;
    forMentee: { email: string; name: string } | null;
  } | null>(null);
  const [sheetKey, setSheetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  if (me === undefined || (isStaff && mine === undefined)) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  const hasMentees = (mine?.mentees.length ?? 0) > 0;
  if (!isAdmin && !hasMentees) {
    return (
      <Screen title="Mentoring">
        {me === null ? (
          <SignInPrompt what="page" />
        ) : (
          <EmptyState
            icon="lock-closed-outline"
            title="Only admins and mentors can open Mentoring"
          />
        )}
      </Screen>
    );
  }

  const yearLabel = (y: number) =>
    y === currentYear ? `${y} (current)` : y === currentYear + 1 ? `${y} (from Oct 1)` : `${y}`;

  const assign = async (mentee: { email: string; name: string }, mentor: MentorChoice, mentorName: string) => {
    setError(null);
    try {
      await setMentor({ year: selectedYear, menteeEmail: mentee.email, mentor });
      setToast({ text: `${mentorName} now mentors ${mentee.name}` });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const openExternalSheet = (
    editing: ExternalMentor | null,
    forMentee: { email: string; name: string } | null = null
  ) => {
    setSheetKey((k) => k + 1);
    setExternalSheet({ key: sheetKey + 1, editing, forMentee });
  };

  const staffEmails = new Set([
    ...(candidates?.leaders ?? []).map((c) => c.email),
    ...(candidates?.campusLeaders ?? []).map((c) => c.email),
  ]);

  const pairs = (pairings?.pairs ?? []).filter((p) =>
    matchesSearch(search, p.mentee.name, p.mentee.email, p.mentee.line, p.mentor.name, p.mentor.email)
  );
  const externalRows = (externals ?? []).filter((e) =>
    matchesSearch(externalSearch, e.name, e.email, e.phone, e.notes)
  );

  const renderPairings = () => (
    <>
      {editable ? null : (
        <InfoBanner message={`${selectedYear} has finished, so its pairings can't be changed.`} />
      )}
      <ErrorBanner message={error} />
      {pairings === undefined ? (
        <LoadingState />
      ) : (pairings?.pairs.length ?? 0) === 0 ? (
        <EmptyState
          icon="compass-outline"
          title={`No pairings in ${selectedYear}`}
          message={
            editable ? "Pair a Campus leader with a mentor to start." : "Nobody was paired this year."
          }
        />
      ) : (
        <>
          <SearchField value={search} onChangeText={setSearch} placeholder="Search pairings" />
          {pairs.length === 0 ? <Muted>No pairings match.</Muted> : null}
          {pairs.map((pair) => (
            <PairingCard key={pair.id} pair={pair} onPress={() => setOpened(pair)} />
          ))}
          <Muted>
            {`${pairings?.pairs.length} ${pairings?.pairs.length === 1 ? "pairing" : "pairings"} in ${selectedYear}`}
          </Muted>
        </>
      )}
    </>
  );

  const renderExternals = () => (
    <>
      {externals === undefined ? (
        <LoadingState />
      ) : externals?.length === 0 ? (
        <EmptyState
          icon="person-add-outline"
          title="No external mentors yet"
          message="Add mentors who aren't SOW leaders, like a pastor or a former leader."
        />
      ) : (
        <>
          <SearchField
            value={externalSearch}
            onChangeText={setExternalSearch}
            placeholder="Search external mentors"
          />
          {externalRows.length === 0 ? <Muted>No external mentors match.</Muted> : null}
          {externalRows.map((external) => (
            <Pressable
              key={external.id}
              onPress={() => openExternalSheet(external)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${external.name}`}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={styles.pairCard}>
                <PersonLine
                  name={external.name}
                  line={[external.email, external.phone].filter(Boolean).join("  ·  ") || null}
                  showAvatar={false}
                  tags={[
                    {
                      text:
                        external.pairingCount === 0
                          ? "Not mentoring yet"
                          : `${external.pairingCount} ${external.pairingCount === 1 ? "pairing" : "pairings"}`,
                      tone: "neutral",
                    },
                  ]}
                />
                {external.notes ? <Muted>{external.notes}</Muted> : null}
              </Card>
            </Pressable>
          ))}
        </>
      )}
    </>
  );

  const renderMine = () => (
    <>
      <Muted>{`People you mentor in ${mine?.year ?? currentYear}.`}</Muted>
      {(mine?.mentees ?? []).map((mentee) => (
        <Card key={mentee.id} style={styles.pairCard}>
          <PersonLine name={mentee.name} line={mentee.line} photo={mentee.photo} />
          <Muted>{mentee.email}</Muted>
        </Card>
      ))}
    </>
  );

  const tabs: PagerTab[] = isAdmin
    ? [
        { key: "pairings", label: "Pairings", render: renderPairings },
        { key: "externals", label: "External mentors", render: renderExternals },
        ...(hasMentees ? [{ key: "mine", label: "My mentees", render: renderMine }] : []),
      ]
    : [{ key: "mine", label: "My mentees", render: renderMine }];
  const activeKey = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  const footers = isAdmin
    ? [
        ...(editable
          ? [
              {
                tabKey: "pairings",
                node: (
                  <FooterAction
                    title="+ Add pairing"
                    avoidKeyboard={false}
                    onPress={() => {
                      setError(null);
                      setPicking({ step: "mentee" });
                    }}
                  />
                ),
              },
            ]
          : []),
        {
          tabKey: "externals",
          node: (
            <FooterAction
              title="+ Add external mentor"
              avoidKeyboard={false}
              onPress={() => openExternalSheet(null)}
            />
          ),
        },
      ]
    : [];

  const openedEditable = editable && opened !== null;

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={(key) => setTab(key as MentoringTab)}
        footers={footers}
        floatingAboveFooter
        floating={
          isAdmin && activeKey === "pairings" ? (
            <FloatingYearPicker
              year={selectedYear}
              years={years ?? [currentYear, currentYear + 1]}
              onSelect={(y) => {
                setYear(y);
                setSearch("");
                setError(null);
              }}
              formatLabel={yearLabel}
            />
          ) : undefined
        }
      />
      <MenteePicker
        visible={picking?.step === "mentee"}
        year={selectedYear}
        candidates={editable ? (candidates ?? undefined) : undefined}
        onPick={(mentee) => {
          setPicking(null);
          afterSheetCloses(() => setPicking({ step: "mentor", mentee }));
        }}
        onClose={() => setPicking(null)}
      />
      <MentorPicker
        visible={picking?.step === "mentor"}
        menteeName={picking?.step === "mentor" ? picking.mentee.name : ""}
        candidates={editable ? (candidates ?? undefined) : undefined}
        onPick={(choice, name) => {
          if (picking?.step !== "mentor") return;
          const mentee = picking.mentee;
          setPicking(null);
          void assign(mentee, choice, name);
        }}
        onNewExternal={() => {
          if (picking?.step !== "mentor") return;
          const mentee = picking.mentee;
          setPicking(null);
          afterSheetCloses(() => openExternalSheet(null, mentee));
        }}
        onClose={() => setPicking(null)}
      />
      <OptionSheet
        visible={opened !== null}
        title={opened?.mentee.name ?? ""}
        onClose={() => setOpened(null)}
        footer={
          openedEditable ? (
            <View style={{ gap: spacing.sm }}>
              <Btn
                title="Change mentor"
                variant="tonal"
                onPress={() => {
                  if (!opened) return;
                  const mentee = { email: opened.mentee.email, name: opened.mentee.name };
                  setOpened(null);
                  setError(null);
                  afterSheetCloses(() => setPicking({ step: "mentor", mentee }));
                }}
              />
              <Btn
                title="Remove pairing"
                variant="danger"
                onPress={() => {
                  const target = opened;
                  setOpened(null);
                  afterSheetCloses(() => setConfirmingRemove(target));
                }}
              />
            </View>
          ) : undefined
        }
      >
        {opened ? (
          <View style={{ gap: spacing.md }}>
            <PersonLine
              name={opened.mentee.name}
              line={opened.mentee.line ?? opened.mentee.email}
              photo={opened.mentee.photo}
              tags={opened.mentee.warning ? [{ text: opened.mentee.warning, tone: "warning" }] : []}
            />
            <Muted>Mentor</Muted>
            <PersonLine
              name={opened.mentor.name}
              line={opened.mentor.line ?? opened.mentor.email}
              photo={opened.mentor.photo}
              tags={[
                ...(opened.mentor.kind === "external"
                  ? [{ text: "External", tone: "neutral" as const }]
                  : []),
                ...(opened.mentor.warning
                  ? [{ text: opened.mentor.warning, tone: "warning" as const }]
                  : []),
              ]}
            />
            <Muted>
              {opened.imported
                ? "Imported from the old SHED app."
                : `Last changed by ${opened.updatedBy} on ${sydneyDateTime(opened.updatedAt)}.`}
            </Muted>
            {editable ? null : <Muted>{`${selectedYear} is read-only.`}</Muted>}
          </View>
        ) : null}
      </OptionSheet>
      <ConfirmDialog
        visible={confirmingRemove !== null}
        title={`Remove ${confirmingRemove?.mentee.name ?? ""}'s pairing?`}
        message={`${confirmingRemove?.mentor.name ?? ""} will no longer be their mentor for ${selectedYear}.`}
        confirmLabel="Remove"
        onConfirm={() => {
          const target = confirmingRemove;
          if (!target) return;
          void removePairing({ id: target.id as Id<"mentorships"> })
            .then(() => setToast({ text: `Removed ${target.mentee.name}'s pairing` }))
            .catch((e) => setError(errorMessage(e)));
        }}
        onClose={() => setConfirmingRemove(null)}
      />
      {externalSheet ? (
        <ExternalMentorSheet
          key={externalSheet.key}
          visible
          editing={externalSheet.editing}
          externals={externals ?? []}
          staffEmails={staffEmails}
          year={editable ? selectedYear : currentYear}
          onSaved={(id, name) => {
            const forMentee = externalSheet.forMentee;
            setExternalSheet(null);
            if (forMentee) void assign(forMentee, { kind: "external", id }, name);
            else setToast({ text: `Saved ${name}` });
          }}
          onClose={() => setExternalSheet(null)}
        />
      ) : null}
      <Toast toast={toast} />
    </>
  );
}

const styles = StyleSheet.create({
  pairCard: { gap: spacing.sm },
  mentorRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: spacing.sm },
  mentorIcon: { marginTop: 2 },
});
