import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  CAMPUS_FIELD_KEY,
  encodeYearMetadataValue,
  formatMetadataFieldValue,
  orderedSelectOptions,
  ROLE_FIELD_KEY,
  STUDENT_YEAR_FIELD_KEY,
  yearOptionIdForStoredValue,
} from "../../../shared/attendanceMemberMeta";
import {
  Btn,
  errorMessage,
  Field,
  LoadingState,
  Select,
  Sheet,
  Txt,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

export function EditMemberSheet({
  visible,
  onClose,
  year,
  staffYear,
  memberId,
  metadataFields,
  eventAttendance,
  prefillName,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  /** Calendar year the student "Year" level is shown/encoded against. */
  year: number;
  /** Staff year a staff overlay's profile (name/email/locked Campus/Role) is read from. */
  staffYear: number;
  memberId: Id<"attendanceMembers"> | null;
  metadataFields: Doc<"attendanceMetadata">[];
  /** When editing from an event roll-call, notes are stored on the attendance row. */
  eventAttendance?: {
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null;
  /** In create mode (memberId null), seeds the Name field — e.g. the roll-call
   *  search text, so "Create member" opens with the typed name already filled. */
  prefillName?: string;
  /** Fired after a new member is created, with the new id, so the caller can act
   *  on it (e.g. sign them straight in to the event). Not fired when editing. */
  onCreated?: (memberId: Id<"attendanceMembers">) => void;
}) {
  const t = useAppTheme();
  const row = useQuery(
    api.attendanceMembers.get,
    visible && memberId ? { memberId, staffYear } : "skip"
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Existing members sharing this name — only checked while creating, so an
  // admin is warned (and must confirm) before adding a duplicate person.
  const duplicates = useQuery(
    api.attendanceMembers.byName,
    visible && !memberId && name.trim() ? { name: name.trim() } : "skip"
  );
  const hasDuplicate = !memberId && (duplicates?.length ?? 0) > 0;

  const metadataSummary = (meta: Record<string, string>) =>
    metadataFields
      .map((f) => formatMetadataFieldValue(f.key, meta[f._id] ?? "", year, f.values))
      .filter(Boolean)
      .join(" · ");

  useEffect(() => {
    if (!visible) return;
    if (memberId && row === undefined) return;
    if (memberId && row) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form when sheet opens
      setName(row.name);
      setEmail(row.email ?? "");
      setMetadata(row.metadata ?? {});
    } else if (!memberId) {
      setName(prefillName ?? "");
      setEmail("");
      setMetadata({});
    }
    setNotes(eventAttendance?.notes ?? "");
    setError(null);
    setDeleteOpen(false);
    setDeleteText("");
    setConfirmOpen(false);
  }, [visible, memberId, row, eventAttendance?.attendanceId, eventAttendance?.notes, prefillName]);

  // New members with a name clash go through a confirmation step first.
  const handleSave = () => {
    if (hasDuplicate) {
      setConfirmOpen(true);
      return;
    }
    void submit();
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let createdId: Id<"attendanceMembers"> | null = null;
      if (memberId) {
        await update({
          memberId,
          name,
          email: email || undefined,
          metadata,
          staffYear,
        });
      } else {
        createdId = await create({ name, email: email || undefined, metadata });
      }
      if (eventAttendance) {
        await updateAttendance({
          attendanceId: eventAttendance.attendanceId,
          notes,
        });
      }
      onClose();
      if (createdId) onCreated?.(createdId);
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
      headerRight={
        memberId && !isStaffOverlay && !loading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete member"
            hitSlop={8}
            onPress={() => setDeleteOpen(true)}
            style={({ pressed }) => [
              {
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: t.dangerSoft,
              },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="trash-outline" size={18} color={t.danger} />
          </Pressable>
        ) : null
      }
      footer={
        loading ? null : (
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Save"
              onPress={handleSave}
              loading={submitting}
              disabled={!isStaffOverlay && !name.trim()}
            />
          </View>
        )
      }
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            disabled={isStaffOverlay}
          />
          {hasDuplicate ? (
            <Txt
              style={[typography.caption, { color: t.warning, marginTop: 4 }]}
            >
              A member with this name already exists.
            </Txt>
          ) : null}
          <Field
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            disabled={isStaffOverlay}
          />
          {metadataFields.map((field) => {
            const lockedForStaff =
              isStaffOverlay &&
              (field.key === CAMPUS_FIELD_KEY || field.key === ROLE_FIELD_KEY);
            return field.type === "select" ? (
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
                disabled={lockedForStaff}
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
                disabled={lockedForStaff}
              />
            );
          })}
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
          <Sheet
            visible={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title="Delete member"
            footer={
              <Btn
                title="Delete member"
                variant="danger"
                loading={submitting}
                disabled={deleteText.trim() !== name.trim()}
                onPress={() => void onDelete()}
              />
            }
          >
            <Txt style={[typography.body, { color: t.text }]}>
              This deletes the member and removes this member from every event they are
              signed into. Type <Txt style={{ fontWeight: "800" }}>{name.trim()}</Txt> to confirm.
            </Txt>
            <Field
              label="Member name"
              value={deleteText}
              onChangeText={setDeleteText}
              placeholder={name}
            />
          </Sheet>
          <Sheet
            visible={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Name already exists"
            footer={
              <Btn
                title="Create anyway"
                variant="danger"
                loading={submitting}
                onPress={() => {
                  setConfirmOpen(false);
                  void submit();
                }}
              />
            }
          >
            <Txt style={[typography.body, { color: t.text }]}>
              {(duplicates?.length ?? 0) === 1
                ? `A member named "${name.trim()}" already exists:`
                : `${duplicates?.length} members named "${name.trim()}" already exist:`}
            </Txt>
            {(duplicates ?? []).map((dup) => {
              const summary = metadataSummary(dup.metadata);
              return (
                <View
                  key={dup._id}
                  style={{
                    gap: 2,
                    marginTop: spacing.sm,
                    paddingLeft: spacing.sm,
                    borderLeftWidth: 2,
                    borderLeftColor: t.warning,
                  }}
                >
                  <Txt style={[typography.headline, { color: t.text }]}>
                    {dup.name}
                  </Txt>
                  {dup.email ? (
                    <Txt style={[typography.caption, { color: t.muted }]}>
                      {dup.email}
                    </Txt>
                  ) : null}
                  {summary ? (
                    <Txt style={[typography.caption, { color: t.muted }]}>
                      {summary}
                    </Txt>
                  ) : null}
                </View>
              );
            })}
            <Txt
              style={[typography.body, { color: t.text, marginTop: spacing.md }]}
            >
              Are you sure you want to create another member with the same name?
            </Txt>
          </Sheet>
        </>
      )}
    </Sheet>
  );
}
