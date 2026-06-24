import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
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
  key: string;
  type: "select" | "input";
  order: number;
  values?: Record<string, string>;
  lockedValues?: string[];
};

const LOCKED_FIELD_KEYS = new Set(["Year", "Gender", "Campus", "Role"]);

export function MetadataTab({ year }: { year: number }) {
  const t = useAppTheme();
  const metadata = useQuery(api.attendanceMetadata.list, { year });
  const ensureDefaults = useMutation(api.attendanceMetadata.ensureDefaults);
  const saveMetadata = useMutation(api.attendanceMetadata.saveAll);

  const [metaDrafts, setMetaDrafts] = useState<FieldDraft[]>([]);
  const [metaDeletes, setMetaDeletes] = useState<Id<"attendanceMetadata">[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void ensureDefaults({ year });
  }, [year, ensureDefaults]);

  useEffect(() => {
    if (metadata) {
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
    }
  }, [metadata]);

  if (metadata === undefined) return <LoadingState />;

  const saveMetaNow = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveMetadata({
        year,
        fields: metaDrafts,
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
          Member fields for {year}. Campus and Role options come from the org
          structure; university and role rows are locked.
        </Muted>
      </View>

      {metaDrafts.map((field, i) => {
        const fieldLocked = LOCKED_FIELD_KEYS.has(field.key);
        return (
          <Card key={field.id ?? `new-${i}`} style={{ marginBottom: spacing.sm, gap: spacing.sm }}>
            <Field
              label="Field name"
              value={field.key}
              disabled={fieldLocked}
              onChangeText={(key) =>
                setMetaDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, key } : x)))
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
                          values: type === "select" ? x.values ?? { "1": "" } : undefined,
                        }
                      : x
                  )
                )
              }
            />
            {field.type === "select"
              ? Object.entries(field.values ?? {}).map(([valueId, label]) => {
                  const locked =
                    field.lockedValues?.includes(label) ||
                    field.lockedValues?.includes(valueId);
                  return (
                    <View key={valueId} style={{ gap: 4 }}>
                      <Field
                        label={`Option ${valueId}`}
                        value={label}
                        disabled={locked}
                        onChangeText={(v) =>
                          setMetaDrafts((prev) =>
                            prev.map((x, j) =>
                              j === i
                                ? { ...x, values: { ...x.values, [valueId]: v } }
                                : x
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
                                if (j !== i || !x.values) return x;
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
                })
              : null}
            {field.type === "select" ? (
              <Btn
                title="Add option"
                variant="ghost"
                onPress={() =>
                  setMetaDrafts((prev) =>
                    prev.map((x, j) => {
                      if (j !== i) return x;
                      const values = { ...(x.values ?? {}) };
                      const nextId = String(
                        Math.max(0, ...Object.keys(values).map(Number).filter(Number.isFinite)) + 1
                      );
                      values[nextId] = "";
                      return { ...x, values };
                    })
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
                  setMetaDrafts((prev) => prev.filter((_, j) => j !== i));
                }}
              />
            ) : null}
          </Card>
        );
      })}

      <Btn
        title="Add field"
        variant="ghost"
        onPress={() =>
          setMetaDrafts((prev) => [
            ...prev,
            { key: "", type: "input", order: prev.length },
          ])
        }
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
