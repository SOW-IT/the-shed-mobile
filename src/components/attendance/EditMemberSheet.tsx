import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  encodeYearMetadataValue,
  orderedSelectOptions,
  STUDENT_YEAR_FIELD_KEY,
  yearOptionIdForStoredValue,
} from "../../../shared/attendanceMemberMeta";
import {
  Btn,
  errorMessage,
  Field,
  Select,
  Sheet,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export function EditMemberSheet({
  visible,
  onClose,
  year,
  memberId,
  metadataFields,
  eventAttendance,
}: {
  visible: boolean;
  onClose: () => void;
  year: number;
  memberId: Id<"attendanceMembers"> | null;
  metadataFields: Doc<"attendanceMetadata">[];
  /** When editing from an event roll-call, notes are stored on the attendance row. */
  eventAttendance?: {
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null;
}) {
  const t = useAppTheme();
  const row = useQuery(
    api.attendanceMembers.get,
    visible && memberId ? { memberId } : "skip"
  );
  const create = useMutation(api.attendanceMembers.create);
  const update = useMutation(api.attendanceMembers.update);
  const remove = useMutation(api.attendanceMembers.remove);
  const updateAttendance = useMutation(api.attendance.updateRecord);

  const isStaffOverlay = Boolean(row?.staffEmail);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (memberId && row === undefined) return;
    if (memberId && row) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when sheet opens
      setName(row.name);
      setEmail(row.email ?? "");
      setMetadata(row.metadata ?? {});
    } else if (!memberId) {
      setName("");
      setEmail("");
      setMetadata({});
    }
    setNotes(eventAttendance?.notes ?? "");
    setError(null);
  }, [visible, memberId, row, eventAttendance?.attendanceId, eventAttendance?.notes]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (memberId) {
        await update({ memberId, name, email: email || undefined, metadata });
      } else {
        await create({ year, name, email: email || undefined, metadata });
      }
      if (eventAttendance) {
        await updateAttendance({
          attendanceId: eventAttendance.attendanceId,
          notes,
        });
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!memberId || isStaffOverlay) return;
    setSubmitting(true);
    try {
      await remove({ memberId });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const loading = Boolean(memberId && row === undefined);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={memberId ? "Edit member" : "New member"}
      footer={
        loading ? null : (
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Save"
              onPress={() => void submit()}
              loading={submitting}
              disabled={!isStaffOverlay && !name.trim()}
            />
            {memberId && !isStaffOverlay ? (
              <Btn
                title="Delete"
                variant="danger"
                onPress={() => void onDelete()}
              />
            ) : null}
          </View>
        )
      }
    >
      {loading ? (
        <Txt style={typography.body}>Loading…</Txt>
      ) : (
        <>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            disabled={isStaffOverlay}
          />
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            disabled={isStaffOverlay}
          />
          {metadataFields.map((field) =>
            field.type === "select" ? (
              <Select
                key={field._id}
                label={
                  field.key === STUDENT_YEAR_FIELD_KEY
                    ? `${field.key} (in ${year})`
                    : field.key
                }
                value={
                  field.key === STUDENT_YEAR_FIELD_KEY && field.values
                    ? yearOptionIdForStoredValue(
                        metadata[field._id] ?? "",
                        year,
                        field.values
                      )
                    : (metadata[field._id] ?? "")
                }
                options={[
                  { label: "—", value: "" },
                  ...orderedSelectOptions(field.values, field.lockedValues).map(
                    ({ id, label }) => ({ label, value: id })
                  ),
                ]}
                onSelect={(v) =>
                  setMetadata((prev) => {
                    const next = { ...prev };
                    if (!v) {
                      delete next[field._id];
                      return next;
                    }
                    if (field.key === STUDENT_YEAR_FIELD_KEY && field.values) {
                      const encoded = encodeYearMetadataValue(
                        v,
                        year,
                        field.values
                      );
                      if (encoded) next[field._id] = encoded;
                      else delete next[field._id];
                    } else {
                      next[field._id] = v;
                    }
                    return next;
                  })
                }
              />
            ) : (
              <Field
                key={field._id}
                label={field.key}
                value={metadata[field._id] ?? ""}
                onChangeText={(v) =>
                  setMetadata((prev) => ({ ...prev, [field._id]: v }))
                }
              />
            )
          )}
          {eventAttendance ? (
            <Field
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for this event…"
              multiline
            />
          ) : null}
          {error ? (
            <Txt style={[typography.caption, { color: t.danger }]}>{error}</Txt>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
