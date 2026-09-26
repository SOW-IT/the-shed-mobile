import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
import { SYDNEY_TIME_ZONE } from "../../../shared/flow";
import { capitalizeMemberName } from "../../../shared/rollcall";
import { MergeMemberSheet } from "@/components/attendance/MergeMemberSheet";
import {
  Btn,
  CannotUndo,
  dismissKeyboard,
  errorMessage,
  Field,
  LoadingState,
  Select,
  Sheet,
  Toast,
  type ToastState,
  Txt,
  WarningBanner,
} from "@/components/ui";
import { durations, radius, spacing, typography, useAppTheme } from "@/theme";

const sameTypedName = (typed: string, name: string) =>
  Boolean(name.trim()) &&
  typed.trim().replace(/\s+/g, " ").toLowerCase() ===
    name.trim().replace(/\s+/g, " ").toLowerCase();

const eventDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });

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
  year: number;
  staffYear: number;
  memberId: Id<"attendanceMembers"> | null;
  metadataFields: Doc<"attendanceMetadata">[];
  eventAttendance?: {
    attendanceId: Id<"attendance">;
    notes?: string;
  } | null;
  prefillName?: string;
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

  const isStaffOverlay = Boolean(row?.isStaffOverlay);
  // Deleting throws attendance away, so only admins (Data and IT, HR, the
  // Director) get the button; everyone else merges duplicates instead.
  const me = useQuery(api.directory.me, visible ? {} : "skip");
  const canDelete = Boolean(me?.isAdmin);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeFromDelete, setMergeFromDelete] = useState(false);
  const [mergeStaff, setMergeStaff] = useState<{ email: string; name: string } | null>(
    null
  );
  // Lives outside the sheet so it can confirm a merge or delete after closing.
  const [toast, setToast] = useState<ToastState>(null);
  const deleteImpact = useQuery(
    api.attendanceMembers.deletePreview,
    visible && deleteOpen && memberId ? { memberId } : "skip"
  );

  const duplicates = useQuery(
    api.attendanceMembers.byName,
    visible && !memberId && name.trim() ? { name: name.trim() } : "skip"
  );
  const hasDuplicate = !memberId && (duplicates?.length ?? 0) > 0;

  // A plain member given a staff email would only be relabelled, leaving their
  // attendance split from the staff person's. Point to Merge instead.
  const typedEmail = email.trim().toLowerCase();
  const emailChanged =
    !isStaffOverlay &&
    typedEmail.includes("@") &&
    typedEmail !== (row?.email ?? "").toLowerCase();
  const staffForEmail = useQuery(
    api.attendanceMembers.staffForEmail,
    visible && emailChanged ? { email: typedEmail, staffYear } : "skip"
  );
  const staffEmailOwner = emailChanged ? (staffForEmail ?? null) : null;

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
      setName(capitalizeMemberName(prefillName ?? ""));
      setEmail("");
      setMetadata({});
    }
    setNotes(eventAttendance?.notes ?? "");
    setError(null);
    setDeleteOpen(false);
    setDeleteText("");
    setConfirmOpen(false);
    setMergeOpen(false);
  }, [visible, memberId, row, eventAttendance?.attendanceId, eventAttendance?.notes, prefillName]);

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
      const deleted = await remove({ memberId });
      await dismissKeyboard();
      setToast({
        text: deleted
          ? `Deleted ${name.trim()}`
          : `${name.trim()} had already been removed`,
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const loading = Boolean(memberId && row === undefined);
  // Deleted or merged away by someone else while this sheet was open.
  const gone = Boolean(memberId) && row === null;

  const sheet = (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={memberId ? "Edit member" : "New member"}
      headerRight={
        memberId && !loading && !gone ? (
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Merge duplicate"
              hitSlop={8}
              onPress={() => {
                setMergeFromDelete(false);
                setMergeStaff(null);
                setMergeOpen(true);
              }}
              style={({ pressed }) => [
                styles.headerButton,
                { backgroundColor: t.ghost },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name="git-merge-outline" size={18} color={t.ghostText} />
            </Pressable>
            {!isStaffOverlay && canDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete member"
                hitSlop={8}
                onPress={() => setDeleteOpen(true)}
                style={({ pressed }) => [
                  styles.headerButton,
                  { backgroundColor: t.dangerSoft },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="trash-outline" size={18} color={t.danger} />
              </Pressable>
            ) : null}
          </View>
        ) : null
      }
      footer={
        loading ? null : gone ? (
          <Btn title="Close" variant="ghost" onPress={onClose} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Btn
              title="Save"
              onPress={handleSave}
              loading={submitting}
              disabled={(!isStaffOverlay && !name.trim()) || Boolean(staffEmailOwner)}
            />
          </View>
        )
      }
    >
      {loading ? (
        <LoadingState />
      ) : gone ? (
        <WarningBanner
          message={`${name.trim() || "This member"} was just deleted or merged by someone else.`}
        />
      ) : (
        <>
          <Field
            label="Name"
            value={name}
            onChangeText={
              memberId
                ? setName
                : (text) => setName(capitalizeMemberName(text))
            }
            placeholder="Full name"
            autoCapitalize={memberId ? "none" : "words"}
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
            testID="member-email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            disabled={isStaffOverlay}
          />
          {staffEmailOwner && !memberId ? (
            <WarningBanner
              message={`This is ${staffEmailOwner.name}'s staff email. They're already in the list as staff.`}
            />
          ) : staffEmailOwner ? (
            <View style={{ gap: spacing.sm }}>
              <WarningBanner
                message={`This is ${staffEmailOwner.name}'s staff email. Merge into them instead.`}
              />
              <Btn
                title={`Merge into ${staffEmailOwner.name}`}
                icon="git-merge-outline"
                variant="tonal"
                onPress={() => {
                  setMergeFromDelete(false);
                  setMergeStaff(staffEmailOwner);
                  setMergeOpen(true);
                }}
              />
            </View>
          ) : null}
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
              <View style={{ gap: spacing.sm }}>
                <Btn
                  title={
                    deleteImpact && deleteImpact.total > 0
                      ? `Delete member and ${deleteImpact.total} record${
                          deleteImpact.total === 1 ? "" : "s"
                        }`
                      : "Delete permanently"
                  }
                  variant="danger"
                  loading={submitting}
                  disabled={
                    deleteImpact === undefined ||
                    !sameTypedName(deleteText, name)
                  }
                  onPress={() => void onDelete()}
                />
                <Btn
                  title="Merge instead"
                  icon="git-merge-outline"
                  variant="tonal"
                  onPress={() => {
                    setDeleteOpen(false);
                    setMergeFromDelete(true);
                    setMergeStaff(null);
                    // iOS can't present a modal while another is still
                    // dismissing, so wait for the delete sheet to fade out.
                    setTimeout(() => setMergeOpen(true), durations.overlayOut + 80);
                  }}
                />
              </View>
            }
          >
            {deleteImpact === undefined ? (
              <LoadingState />
            ) : (
              <>
                <View
                  style={[
                    styles.deleteWarning,
                    { backgroundColor: t.dangerSoft, borderColor: t.danger },
                  ]}
                >
                  <View style={styles.deleteWarningTitle}>
                    <Ionicons name="warning" size={20} color={t.danger} />
                    <Txt
                      style={[typography.headline, { color: t.danger, flex: 1 }]}
                    >
                      {deleteImpact && deleteImpact.total > 0
                        ? `Removes ${name.trim()} from ${
                            deleteImpact.total === 1 ? "1 event" : `${deleteImpact.total} events`
                          }`
                        : `${name.trim()} has no attendance`}
                    </Txt>
                  </View>
                  {deleteImpact && deleteImpact.total > 0 ? (
                    <Txt style={[typography.body, { color: t.text }]}>
                      Their attendance is deleted from rolls, exports and Insights.
                    </Txt>
                  ) : null}
                  <CannotUndo />
                </View>
                {deleteImpact && deleteImpact.total > 0 ? (
                  <>
                    <Txt
                      style={[
                        typography.label,
                        { color: t.muted, marginTop: spacing.sm },
                      ]}
                    >
                      ATTENDANCE DELETED
                    </Txt>
                    <View
                      style={[
                        styles.deleteList,
                        { borderColor: t.separator, backgroundColor: t.card },
                      ]}
                    >
                      {deleteImpact.events.map((e) => (
                        <View key={e.attendanceId} style={styles.deleteListRow}>
                          <Ionicons
                            name="close-circle"
                            size={14}
                            color={t.danger}
                          />
                          <Txt
                            style={[typography.body, { color: t.text, flex: 1 }]}
                            numberOfLines={1}
                          >
                            {e.name}
                          </Txt>
                          <Txt style={[typography.caption, { color: t.muted }]}>
                            {eventDate(e.dateStart)}
                          </Txt>
                        </View>
                      ))}
                      {deleteImpact.total > deleteImpact.events.length ? (
                        <Txt style={[typography.caption, { color: t.muted }]}>
                          and {deleteImpact.total - deleteImpact.events.length}{" "}
                          more
                        </Txt>
                      ) : null}
                    </View>
                  </>
                ) : null}
                <Txt style={[typography.body, { color: t.text, marginTop: spacing.sm }]}>
                  {eventAttendance ? "Just this event? Remove their sign-in instead. " : ""}
                  Duplicate? Merge instead to keep their attendance.
                </Txt>
                <Txt style={[typography.body, { color: t.text, marginTop: spacing.sm }]}>
                  Type <Txt style={{ fontWeight: "800" }}>{name.trim()}</Txt> to
                  delete.
                </Txt>
                <Field
                  label="Member name"
                  testID="delete-confirm-name"
                  value={deleteText}
                  onChangeText={setDeleteText}
                  placeholder={name}
                />
              </>
            )}
          </Sheet>
          {memberId ? (
            <MergeMemberSheet
              visible={mergeOpen}
              onClose={() => setMergeOpen(false)}
              onMerged={(summary) => {
                setToast({ text: summary });
                onClose();
              }}
              memberId={memberId}
              memberEmail={row?.email}
              isStaff={isStaffOverlay}
              year={year}
              staffYear={staffYear}
              removeViewedByDefault={mergeFromDelete}
              initialStaff={mergeStaff}
            />
          ) : null}
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

  return (
    <>
      {sheet}
      <Toast toast={toast} />
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", gap: spacing.sm },
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteWarning: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  deleteWarningTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  deleteList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  deleteListRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
