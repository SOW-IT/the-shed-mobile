import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  CAMPUS_FIELD_KEY,
  metadataFieldAllowsCustomOptions,
  partitionSelectOptions,
  ROLE_FIELD_KEY,
} from "../../../shared/attendanceMemberMeta";
import { ReorderableList } from "@/components/ReorderableList";
import {
  Btn,
  Card,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  Select,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type FieldDraft = {
  id?: Id<"attendanceMetadata">;
  /** Stable React key for unsaved rows (survives reorder). */
  draftKey?: string;
  key: string;
  type: "select" | "input";
  order: number;
  values?: Record<string, string>;
  lockedValues?: string[];
};

const LOCKED_FIELD_KEYS = new Set(["Year", "Gender", "Campus", "Role"]);

const typeLabel = (type: FieldDraft["type"]) =>
  type === "select" ? "Select" : "Text input";

const rowKey = (field: FieldDraft) => field.id ?? field.draftKey ?? field.key;

const reindexFields = (fields: FieldDraft[]) =>
  fields.map((field, order) => ({ ...field, order }));

const addSelectOption = (values: Record<string, string> | undefined) => {
  const next = { ...(values ?? {}) };
  const nextId = String(
    Math.max(0, ...Object.keys(next).map(Number).filter(Number.isFinite)) + 1
  );
  next[nextId] = "";
  return next;
};

const renderSelectOptionEditor = (
  field: FieldDraft,
  index: number,
  valueId: string,
  label: string,
  locked: boolean,
  setMetaDrafts: Dispatch<SetStateAction<FieldDraft[]>>
) => (
  <View key={valueId} style={{ gap: 4 }}>
    <Field
      label={locked ? label || `Option ${valueId}` : `Option ${valueId}`}
      value={label}
      disabled={locked}
      onChangeText={(v) =>
        setMetaDrafts((prev) =>
          prev.map((x, j) =>
            j === index ? { ...x, values: { ...x.values, [valueId]: v } } : x
          )
        )
      }
    />
    {!locked ? (
      <Btn
        title="Remove option"
        variant="ghost"
        onPress={() =>
          setMetaDrafts((prev) =>
            prev.map((x, j) => {
              if (j !== index || !x.values) return x;
              const next = { ...x.values };
              delete next[valueId];
              return { ...x, values: next };
            })
          )
        }
      />
    ) : null}
  </View>
);

export function MetadataTab({ year }: { year: number }) {
  const t = useAppTheme();
  const metadata = useQuery(api.attendanceMetadata.list, { year });
  const ensureDefaults = useMutation(api.attendanceMetadata.ensureDefaults);
  const saveMetadata = useMutation(api.attendanceMetadata.saveAll);

  const [metaDrafts, setMetaDrafts] = useState<FieldDraft[]>([]);
  const [metaDeletes, setMetaDeletes] = useState<Id<"attendanceMetadata">[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void ensureDefaults({ year });
  }, [year, ensureDefaults]);

  useEffect(() => {
    if (metadata) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync drafts from server
      setMetaDrafts(
        metadata.map((f) => ({
          id: f._id,
          key: f.key,
          type: f.type,
          order: f.order,
          values: f.values,
          lockedValues: f.lockedValues,
        }))
      );
      setMetaDeletes([]);
      setExpandedKeys(new Set());
    }
  }, [metadata]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (metadata === undefined) return <LoadingState />;

  const saveMetaNow = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMetadata({
        year,
        fields: reindexFields(metaDrafts),
        deleteIds: metaDeletes,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={{ marginBottom: spacing.md }}>
        <Muted>
          Member fields for {year}. Drag the grip to reorder — the same order
          applies in the edit member sheet. Campus and Role include options from
          the org structure; you can add more below them. Year is derived from
          when someone was in first year and advances each staff year.
        </Muted>
      </View>

      <ReorderableList
        items={metaDrafts}
        keyExtractor={(field) => rowKey(field)}
        reorderEnabled={!saving}
        onReorder={(next) => setMetaDrafts(reindexFields(next))}
        renderItem={(field, i, { dragHandle, dragging }) => {
          const fieldLocked = LOCKED_FIELD_KEYS.has(field.key);
          const key = rowKey(field);
          const expanded = expandedKeys.has(key);

          return (
            <Card
              style={[
                { marginBottom: 0 },
                dragging && { shadowOpacity: 0.2, elevation: 4 },
              ]}
            >
              <View style={styles.fieldHeader}>
                {dragHandle}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${field.key || "New field"}, ${typeLabel(field.type)}`}
                  onPress={() => toggleExpanded(key)}
                  style={({ pressed }) => [
                    styles.fieldHeaderMain,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typography.headline, { color: t.text }]}>
                      {field.key.trim() || "New field"}
                    </Text>
                    <Muted>{typeLabel(field.type)}</Muted>
                  </View>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={t.muted}
                  />
                </Pressable>
              </View>

              {expanded ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <Field
                    label="Field name"
                    value={field.key}
                    disabled={fieldLocked}
                    onChangeText={(name) =>
                      setMetaDrafts((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, key: name } : x))
                      )
                    }
                  />
                  <Select
                    label="Type"
                    value={field.type}
                    disabled={fieldLocked}
                    options={[
                      { label: "Select", value: "select" },
                      { label: "Text input", value: "input" },
                    ]}
                    onSelect={(type) =>
                      setMetaDrafts((prev) =>
                        prev.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                type: type as "select" | "input",
                                values:
                                  type === "select"
                                    ? x.values ?? { "1": "" }
                                    : undefined,
                              }
                            : x
                        )
                      )
                    }
                  />
                  {field.type === "select"
                    ? (() => {
                        const { locked, custom } = partitionSelectOptions(
                          field.values,
                          field.lockedValues
                        );
                        const showSections =
                          field.key === CAMPUS_FIELD_KEY ||
                          field.key === ROLE_FIELD_KEY;
                        return (
                          <>
                            {showSections && locked.length > 0 ? (
                              <View style={{ marginTop: spacing.xs }}>
                                <Muted>From org structure</Muted>
                              </View>
                            ) : null}
                            {locked.map(({ id, label }) =>
                              renderSelectOptionEditor(
                                field,
                                i,
                                id,
                                label,
                                true,
                                setMetaDrafts
                              )
                            )}
                            {showSections && custom.length > 0 ? (
                              <View style={{ marginTop: spacing.sm }}>
                                <Muted>Additional options</Muted>
                              </View>
                            ) : null}
                            {custom.map(({ id, label }) =>
                              renderSelectOptionEditor(
                                field,
                                i,
                                id,
                                label,
                                false,
                                setMetaDrafts
                              )
                            )}
                          </>
                        );
                      })()
                    : null}
                  {field.type === "select" &&
                  metadataFieldAllowsCustomOptions(field.key, fieldLocked) ? (
                    <Btn
                      title="Add option"
                      variant="ghost"
                      onPress={() =>
                        setMetaDrafts((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, values: addSelectOption(x.values) } : x
                          )
                        )
                      }
                    />
                  ) : null}
                  {field.id && !fieldLocked ? (
                    <Btn
                      title="Delete field"
                      variant="danger"
                      onPress={() => {
                        setMetaDeletes((d) => [...d, field.id!]);
                        setMetaDrafts((prev) => reindexFields(prev.filter((_, j) => j !== i)));
                        setExpandedKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(key);
                          return next;
                        });
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }}
      />

      <Btn
        title="Add field"
        variant="ghost"
        onPress={() => {
          const draftKey = `new-${Date.now()}`;
          setMetaDrafts((prev) =>
            reindexFields([
              ...prev,
              { draftKey, key: "", type: "input", order: prev.length },
            ])
          );
          setExpandedKeys((prev) => new Set(prev).add(draftKey));
        }}
      />
      <Btn title="Save metadata" onPress={() => void saveMetaNow()} loading={saving} />

      {error ? (
        <Txt style={[typography.caption, { color: t.danger, marginTop: spacing.sm }]}>
          {error}
        </Txt>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  fieldHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
