import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  cleanExternalMentor,
  type ExternalMentorDraft,
  externalMentorError,
  matchesSearch,
  sameEmailExternal,
  sameNameExternal,
} from "@shared/mentoring";
import {
  Avatar,
  Btn,
  ConfirmDialog,
  ErrorBanner,
  errorMessage,
  Field,
  Muted,
  OptionSheet,
  Row,
  SearchField,
  WarningBanner,
} from "@/components/ui";
import { durations, radius, spacing, typography, useAppTheme } from "@/theme";

export type Candidates = NonNullable<FunctionReturnType<typeof api.mentoring.candidates>>;
export type ExternalMentor = NonNullable<
  FunctionReturnType<typeof api.mentoring.externalMentors>
>[number];
export type MentorChoice =
  | { kind: "leader"; email: string }
  | { kind: "external"; id: Id<"externalMentors"> };

export const Tag = ({ text, tone }: { text: string; tone: "neutral" | "warning" }) => {
  const t = useAppTheme();
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: tone === "warning" ? t.warningSoft : t.ghost },
      ]}
    >
      <Text
        style={[styles.tagText, { color: tone === "warning" ? t.warning : t.ghostText }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
};

export const PersonLine = ({
  name,
  line,
  photo,
  showAvatar = true,
  tags = [],
}: {
  name: string;
  line?: string | null;
  photo?: string | null;
  showAvatar?: boolean;
  tags?: { text: string; tone: "neutral" | "warning" }[];
}) => {
  const t = useAppTheme();
  return (
    <View style={styles.person}>
      {showAvatar ? <Avatar photo={photo ?? null} name={name} size={40} /> : null}
      <View style={styles.personText}>
        <Text numberOfLines={1} style={[typography.headline, { color: t.text }]}>
          {name}
        </Text>
        {line ? (
          <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
            {line}
          </Text>
        ) : null}
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag) => (
              <Tag key={tag.text} text={tag.text} tone={tag.tone} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
};

const PickRow = ({
  title,
  line,
  note,
  disabled,
  onPress,
}: {
  title: string;
  line?: string | null;
  note?: string | null;
  disabled?: boolean;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={[title, note].filter(Boolean).join(", ")}
      style={({ pressed }) => [
        styles.pickRow,
        disabled && { opacity: 0.45 },
        pressed && { backgroundColor: t.primarySoft },
      ]}
    >
      <View style={styles.personText}>
        <Text numberOfLines={1} style={[typography.body, { color: t.text, fontWeight: "600" }]}>
          {title}
        </Text>
        {line ? (
          <Text numberOfLines={1} style={[typography.caption, { color: t.muted }]}>
            {line}
          </Text>
        ) : null}
        {note ? (
          <Text numberOfLines={1} style={[typography.caption, { color: t.faint }]}>
            {note}
          </Text>
        ) : null}
      </View>
      {disabled ? null : <Ionicons name="chevron-forward" size={18} color={t.faint} />}
    </Pressable>
  );
};

const GroupLabel = ({ children }: { children: string }) => {
  const t = useAppTheme();
  return <Text style={[typography.label, styles.groupLabel, { color: t.muted }]}>{children}</Text>;
};

export const MenteePicker = ({
  visible,
  year,
  candidates,
  onPick,
  onClose,
}: {
  visible: boolean;
  year: number;
  candidates: Candidates | undefined;
  onPick: (mentee: Candidates["campusLeaders"][number]) => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const rows = (candidates?.campusLeaders ?? []).filter((c) =>
    matchesSearch(query, c.name, c.email, c.line)
  );
  return (
    <OptionSheet
      visible={visible}
      title={`Choose a Campus leader (${year})`}
      onClose={() => {
        setQuery("");
        onClose();
      }}
    >
      <SearchField value={query} onChangeText={setQuery} placeholder="Search Campus leaders" />
      {candidates === undefined ? <Muted>Loading…</Muted> : null}
      {candidates && rows.length === 0 ? <Muted>No Campus leaders match.</Muted> : null}
      {rows.map((c) => (
        <PickRow
          key={c.email}
          title={c.name}
          line={c.line}
          note={c.mentoredBy ? `Mentored by ${c.mentoredBy}` : null}
          disabled={c.mentoredBy !== null}
          onPress={() => {
            setQuery("");
            onPick(c);
          }}
        />
      ))}
    </OptionSheet>
  );
};

export const MentorPicker = ({
  visible,
  menteeName,
  candidates,
  onPick,
  onNewExternal,
  onClose,
}: {
  visible: boolean;
  menteeName: string;
  candidates: Candidates | undefined;
  onPick: (choice: MentorChoice, name: string) => void;
  onNewExternal: () => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const leaders = (candidates?.leaders ?? []).filter((c) =>
    matchesSearch(query, c.name, c.email, c.line)
  );
  const externals = (candidates?.externals ?? []).filter((c) =>
    matchesSearch(query, c.name, c.email)
  );
  const pick = (choice: MentorChoice, name: string) => {
    setQuery("");
    onPick(choice, name);
  };
  return (
    <OptionSheet
      visible={visible}
      title={`Mentor for ${menteeName}`}
      onClose={() => {
        setQuery("");
        onClose();
      }}
      footer={
        <Btn
          title="New external mentor"
          icon="person-add-outline"
          variant="tonal"
          onPress={() => {
            setQuery("");
            onNewExternal();
          }}
        />
      }
    >
      <SearchField value={query} onChangeText={setQuery} placeholder="Search leaders and external mentors" />
      {candidates === undefined ? <Muted>Loading…</Muted> : null}
      <GroupLabel>Leaders</GroupLabel>
      {candidates && leaders.length === 0 ? <Muted>No leaders match.</Muted> : null}
      {leaders.map((c) => (
        <PickRow
          key={c.email}
          title={c.name}
          line={c.line}
          onPress={() => pick({ kind: "leader", email: c.email }, c.name)}
        />
      ))}
      <GroupLabel>External mentors</GroupLabel>
      {candidates && externals.length === 0 ? (
        <Muted>
          {candidates.externals.length === 0
            ? "No external mentors yet."
            : "No external mentors match."}
        </Muted>
      ) : null}
      {externals.map((c) => (
        <PickRow
          key={c.id}
          title={c.name}
          line={c.email ?? "External"}
          onPress={() => pick({ kind: "external", id: c.id }, c.name)}
        />
      ))}
    </OptionSheet>
  );
};

const emptyDraft: ExternalMentorDraft = { name: "", email: "", phone: "", notes: "" };

export const draftOf = (mentor: ExternalMentor | null): ExternalMentorDraft =>
  mentor
    ? {
        name: mentor.name,
        email: mentor.email ?? "",
        phone: mentor.phone ?? "",
        notes: mentor.notes ?? "",
      }
    : emptyDraft;

export const ExternalMentorSheet = ({
  visible,
  editing,
  externals,
  staffEmails,
  year,
  onSaved,
  onClose,
}: {
  visible: boolean;
  editing: ExternalMentor | null;
  externals: { id: string; name: string; email: string | null }[];
  staffEmails: ReadonlySet<string>;
  year: number;
  onSaved: (id: Id<"externalMentors">, name: string) => void;
  onClose: () => void;
}) => {
  const save = useMutation(api.mentoring.saveExternalMentor);
  const remove = useMutation(api.mentoring.removeExternalMentor);
  const [draft, setDraft] = useState<ExternalMentorDraft>(() => draftOf(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmShown, setConfirmShown] = useState(false);
  const deleting = useRef(false);
  const afterSheetCloses = (open: () => void) => setTimeout(open, durations.overlayOut + 80);
  const set = (key: keyof ExternalMentorDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const clean = cleanExternalMentor(draft);
  const problem = draft.name.trim() || draft.email.trim() ? externalMentorError(draft) : null;
  const emailTwin = sameEmailExternal(draft, externals, editing?.id);
  const nameTwin = sameNameExternal(draft, externals, editing?.id);
  const isStaff = clean.email ? staffEmails.has(clean.email) : false;
  const ready = !externalMentorError(draft) && !emailTwin && !saving;

  const close = () => {
    setError(null);
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const id = await save({
        ...(editing ? { id: editing.id } : {}),
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        notes: draft.notes,
      });
      onSaved(id, clean.name);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const used = editing?.pairingCount ?? 0;

  return (
    <>
      <OptionSheet
        visible={visible && !confirmingDelete}
        title={editing ? "Edit external mentor" : "New external mentor"}
        onClose={close}
        footer={
          <Row spread>
            <Btn title="Cancel" variant="ghost" onPress={close} />
            <Btn title="Save" loading={saving} disabled={!ready} onPress={() => void submit()} />
          </Row>
        }
      >
        <Field label="Name" value={draft.name} onChangeText={set("name")} autoCapitalize="words" />
        <Field
          label="Email (optional)"
          value={draft.email}
          onChangeText={set("email")}
          keyboardType="email-address"
        />
        <Field label="Phone (optional)" value={draft.phone} onChangeText={set("phone")} />
        <Field
          label="Notes (optional)"
          value={draft.notes}
          onChangeText={set("notes")}
          autoCapitalize="sentences"
          multiline
        />
        <ErrorBanner
          message={
            error ??
            (emailTwin ? `${emailTwin.name} already uses ${clean.email}.` : null) ??
            problem
          }
        />
        <WarningBanner
          message={
            isStaff
              ? `${clean.email} is a leader in ${year}. Pick them under Leaders instead.`
              : nameTwin
                ? `There's already an external mentor called ${nameTwin.name}. Save anyway if this is someone else.`
                : null
          }
        />
        {editing ? (
          <View style={styles.deleteBlock}>
            {used > 0 ? (
              <Muted>
                {`In ${used} ${used === 1 ? "pairing" : "pairings"} (${editing.years.join(", ")}), so they can't be deleted.`}
              </Muted>
            ) : null}
            <Btn
              title="Delete external mentor"
              variant="danger"
              disabled={used > 0}
              onPress={() => {
                setConfirmingDelete(true);
                afterSheetCloses(() => setConfirmShown(true));
              }}
            />
          </View>
        ) : null}
      </OptionSheet>
      <ConfirmDialog
        visible={confirmShown}
        title={`Delete ${editing?.name ?? ""}?`}
        message="They'll no longer appear in the mentor list."
        onConfirm={() => {
          if (!editing) return;
          deleting.current = true;
          void remove({ id: editing.id })
            .then(close)
            .catch((e) => {
              deleting.current = false;
              setError(errorMessage(e));
              setConfirmingDelete(false);
            });
        }}
        onClose={() => {
          setConfirmShown(false);
          if (!deleting.current) afterSheetCloses(() => setConfirmingDelete(false));
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  person: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  personText: { flex: 1, gap: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
  tag: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  tagText: { fontSize: 11, fontWeight: "700" },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  groupLabel: { marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  deleteBlock: { gap: spacing.sm, marginTop: spacing.md },
});
