import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  Btn,
  Card,
  Field,
  Grid,
  IconButton,
  Muted,
  Row,
  SectionTitle,
  Select,
  Txt,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme, WIDE_SCREEN_MIN_WIDTH } from "@/theme";

const ADMIN_CARD_WIDTH = 360;

export const CardGrid = ({
  children,
  maxVisible,
}: {
  children: ReactNode;
  maxVisible?: number;
}) => {
  const { width } = useWindowDimensions();
  const showAll = Platform.OS === "web" || width >= WIDE_SCREEN_MIN_WIDTH;
  return (
    <Grid
      fixedWidth={ADMIN_CARD_WIDTH}
      align="start"
      maxVisible={showAll ? undefined : maxVisible}
    >
      {children}
    </Grid>
  );
};

export type DeleteConfirm = { name: string; message?: string; onConfirm: () => void };

export type StructureItem = { name: string; division?: string; headEmail?: string | null };

type StructureForm = { name: string; division: string; head: string };

const EMPTY_FORM: StructureForm = { name: "", division: "", head: "" };

export const useStructureDraft = () => {
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  return { draft, setDraft, editingKey, setEditingKey, edit, setEdit, saving, setSaving };
};

const peopleText = (count: number) =>
  `${count} ${count === 1 ? "person" : "people"}`;

const LockedNameRow = ({ label, name }: { label: string; name: string }) => {
  const t = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <View style={[styles.lockedBox, { backgroundColor: t.inputBackground }]}>
        <Text style={[typography.body, { color: t.text, flex: 1 }]}>
          {name}
        </Text>
        <Ionicons
          name="lock-closed-outline"
          size={18}
          color={t.muted}
          accessibilityLabel="Used by the app. Can't be renamed"
        />
      </View>
    </View>
  );
};

export const MetaItem = ({
  icon,
  children,
  flush,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  flush?: boolean;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.metaItem, flush && { marginTop: 0 }]}>
      <Ionicons name={icon} size={12} color={t.muted} />
      <Muted>{children}</Muted>
    </View>
  );
};

export const StructureEditor = ({
  title,
  year,
  editable,
  state,
  items,
  emptyText,
  addLabel,
  addTitle,
  renameLabel,
  lockedNameLabel,
  nameLocked,
  systemLocked,
  divisions,
  head,
  holdersLoaded,
  holders,
  jobs,
  details = (_item, holderCount) => holderCount,
  editLabel,
  deleteMessage,
  run,
  confirmDelete,
  add,
  update,
  remove,
}: {
  title: string;
  year: number;
  editable: boolean;
  state: ReturnType<typeof useStructureDraft>;
  items: StructureItem[];
  emptyText?: string;
  addLabel: string;
  addTitle: string;
  renameLabel: string;
  lockedNameLabel?: string;
  nameLocked?: (name: string) => boolean;
  systemLocked?: (name: string) => boolean;
  divisions?: string[];
  head?: { addLabel: string; editLabel: string; options: { label: string; value: string }[] };
  holdersLoaded: boolean;
  holders: (item: StructureItem) => number;
  jobs?: (item: StructureItem) => string[];
  details?: (item: StructureItem, holderCount: ReactNode) => ReactNode;
  editLabel?: (item: StructureItem) => string;
  deleteMessage?: (item: StructureItem) => string | undefined;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  confirmDelete: (confirm: DeleteConfirm) => void;
  add: (form: StructureForm) => Promise<unknown>;
  update: (item: StructureItem, form: StructureForm) => Promise<unknown>;
  remove: (item: StructureItem) => Promise<unknown>;
}) => {
  const t = useAppTheme();
  const { draft, setDraft, editingKey, setEditingKey, edit, setEdit, saving, setSaving } = state;
  const draftDivision = divisions?.includes(draft.division) ? draft.division : "";
  const headOptions = head ? [{ label: "— No head —", value: "" }, ...head.options] : [];

  const unchanged = (item: StructureItem) =>
    edit.name.trim() === item.name &&
    (!divisions || edit.division === item.division) &&
    (!head || edit.head === (item.headEmail ?? ""));

  const save = (item: StructureItem) => {
    setSaving(true);
    void run(() => update(item, edit))
      .then((ok) => {
        if (ok) setEditingKey(null);
      })
      .finally(() => setSaving(false));
  };

  const holderCount = (count: number) =>
    holdersLoaded ? <MetaItem icon="people-outline">{peopleText(count)}</MetaItem> : null;

  const deleteButton = (item: StructureItem, count: number) => {
    const itemJobs = jobs?.(item) ?? [];
    const blocked = !holdersLoaded || count > 0 || itemJobs.length > 0;
    return (
      <IconButton
        name="trash-outline"
        color={blocked ? t.faint : t.danger}
        disabled={blocked}
        accessibilityLabel={
          count > 0
            ? `Delete ${item.name}, unavailable while ${peopleText(count)} hold it`
            : itemJobs.length > 0
              ? `Delete ${item.name}, unavailable while it does ${itemJobs.join(", ")}`
              : `Delete ${item.name}`
        }
        onPress={() =>
          confirmDelete({
            name: item.name,
            message: deleteMessage?.(item),
            onConfirm: () => void run(() => remove(item)),
          })
        }
      />
    );
  };

  return (
    <>
      <SectionTitle>
        {title} · {year}
      </SectionTitle>
      <CardGrid>
        {editable && (
          <Card>
            <Field
              label={addLabel}
              value={draft.name}
              onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
            />
            {divisions && (
              <Select
                label="Division"
                value={draftDivision}
                options={divisions}
                onSelect={(division) => setDraft((d) => ({ ...d, division }))}
                placeholder="Choose a division…"
              />
            )}
            {head && (
              <Select
                label={head.addLabel}
                value={draft.head}
                options={headOptions}
                onSelect={(headEmail) => setDraft((d) => ({ ...d, head: headEmail }))}
                placeholder="Choose a person…"
              />
            )}
            <Btn
              title={addTitle}
              disabled={divisions ? !draft.name.trim() || !draftDivision : undefined}
              onPress={() =>
                void run(() => add({ ...draft, division: draftDivision })).then((ok) => {
                  if (ok) setDraft((d) => ({ ...d, name: "", head: "" }));
                })
              }
            />
          </Card>
        )}
        {emptyText && items.length === 0 && (
          <Card>
            <Muted>{emptyText}</Muted>
          </Card>
        )}
        {items.map((item) => {
          const count = holders(item);
          const locked = nameLocked?.(item.name) ?? false;
          const managed = systemLocked?.(item.name) ?? false;
          return (
            <Card key={item.name}>
              {editingKey === item.name ? (
                <>
                  {locked && lockedNameLabel ? (
                    <LockedNameRow label={lockedNameLabel} name={item.name} />
                  ) : (
                    <Field
                      label={renameLabel}
                      value={edit.name}
                      onChangeText={(name) => setEdit((e) => ({ ...e, name }))}
                    />
                  )}
                  {divisions && (
                    <Select
                      label="Division"
                      value={edit.division}
                      options={divisions}
                      onSelect={(division) => setEdit((e) => ({ ...e, division }))}
                      placeholder="Choose a division…"
                    />
                  )}
                  {head && (
                    <Select
                      label={head.editLabel}
                      value={edit.head}
                      options={headOptions}
                      onSelect={(headEmail) => setEdit((e) => ({ ...e, head: headEmail }))}
                      placeholder="Choose a person…"
                    />
                  )}
                  <Row spread loading={saving}>
                    <Btn title="Cancel" variant="ghost" onPress={() => setEditingKey(null)} />
                    <Btn
                      title="Save"
                      disabled={
                        !edit.name.trim() || (!!divisions && !edit.division) || unchanged(item)
                      }
                      onPress={() => save(item)}
                    />
                  </Row>
                </>
              ) : (
                <View style={styles.cardRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {nameLocked ? (
                      <View style={styles.nameRow}>
                        <Txt style={{ fontWeight: "600" }}>{item.name}</Txt>
                        {locked ? (
                          <Ionicons
                            name="lock-closed-outline"
                            size={14}
                            color={t.muted}
                            accessibilityLabel="Used by the app. Can't be renamed"
                          />
                        ) : null}
                      </View>
                    ) : (
                      <Txt style={{ fontWeight: "600" }}>{item.name}</Txt>
                    )}
                    {details(item, holderCount(count))}
                  </View>
                  {editable && managed && (
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={t.muted}
                      accessibilityLabel="Managed by the app. Can't be renamed or deleted"
                    />
                  )}
                  {editable && !managed && (
                    <>
                      <IconButton
                        name="create-outline"
                        accessibilityLabel={editLabel?.(item)}
                        onPress={() => {
                          setEdit({
                            name: item.name,
                            division: item.division ?? "",
                            head: item.headEmail ?? "",
                          });
                          setEditingKey(item.name);
                        }}
                      />
                      {deleteButton(item, count)}
                    </>
                  )}
                </View>
              )}
            </Card>
          );
        })}
      </CardGrid>
    </>
  );
};

const styles = StyleSheet.create({
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
  },
  lockedBox: {
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
