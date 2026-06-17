import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type Assignment,
  departmentsOf,
  DIRECTOR,
  divisionsOf,
  formatAssignment,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isChaplainRole,
  MEMBER,
  ROLES,
  roleNeedsDepartment,
  roleNeedsUniversity,
  scopeKindFor,
} from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import {
  Btn,
  Card,
  ConfirmDialog,
  ErrorBanner,
  errorMessage,
  Field,
  IconButton,
  LoadingState,
  MultiSelect,
  Muted,
  OptionRow,
  OptionSheet,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Select,
  type ToastState,
  Txt,
} from "@/components/ui";

/**
 * Admin console: per-year staff roles/departments (including people who
 * haven't signed in yet, by email), divisions, departments and the Budget
 * Manager — split into Users / Structure / Other tabs. Admins can EDIT the
 * current year and the next one (next-year changes take effect at the
 * September 1 rollover) and VIEW any past year.
 */

type DeleteConfirm = { name: string; message: string; onConfirm: () => void };

type AdminTab = "users" | "structure" | "other";
const ADMIN_TABS = [
  { key: "users", label: "Users" },
  { key: "structure", label: "Structure" },
  { key: "other", label: "Other" },
];

type StructureSubTab = "roles" | "divisions" | "departments" | "universities";
const STRUCTURE_SUB_TABS = [
  { key: "roles", label: "Roles" },
  { key: "divisions", label: "Divisions" },
  { key: "departments", label: "Departments" },
  { key: "universities", label: "Universities" },
];

/**
 * Roles assignable via the staff profile picker. Head roles are set exclusively
 * through the Structure tab, and "Member" is not an assignable role here.
 */
const STAFF_EDITABLE_ROLES = ROLES.filter(
  (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER
);

type AssignmentDraft = { role: string; department: string; university: string };
const emptyDraft = (role = STAFF_EDITABLE_ROLES[0]): AssignmentDraft => ({
  role,
  department: "",
  university: "",
});

const AssignmentEditor = ({
  assignments,
  onChange,
  departments,
  universities,
  roles = STAFF_EDITABLE_ROLES,
  startIndex = 0,
  minCount = 1,
}: {
  assignments: AssignmentDraft[];
  onChange: (a: AssignmentDraft[]) => void;
  departments: string[];
  universities: string[];
  roles?: string[];
  startIndex?: number;
  // The fewest rows that must remain — e.g. 0 when head roles already cover the
  // profile, so the last non-head assignment can be removed too.
  minCount?: number;
}) => {
  const t = useAppTheme();
  const totalCount = startIndex + assignments.length;
  // Confirm before dropping an assignment row from the draft (not a DB delete).
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  return (
    <View style={{ gap: 8 }}>
      {assignments.map((a, i) => {
        const needsUni = roleNeedsUniversity(a.role);
        const isChaplain = isChaplainRole(a.role);
        const needsDept = roleNeedsDepartment(a.role) && !isChaplain;
        const update = (patch: Partial<AssignmentDraft>) => {
          const next = [...assignments];
          next[i] = { ...next[i], ...patch };
          onChange(next);
        };
        // Always include the row's current role even if it was filtered out
        // (e.g. editing an existing Director when another was later added).
        const rowRoles = roles.includes(a.role) ? roles : [a.role, ...roles];
        return (
          <View
            key={i}
            style={{
              backgroundColor: t.ghost,
              borderRadius: radius.md,
              padding: 12,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Select
                  label={totalCount > 1 ? `Assignment ${startIndex + i + 1}` : "Role"}
                  value={a.role}
                  options={rowRoles}
                  onSelect={(role) => update({ role, department: "", university: "" })}
                />
              </View>
              {assignments.length > minCount && (
                // The row is bottom-aligned to the dropdown; nudge the 34px
                // icon up by (46-34)/2 so it sits centred on the 46px box.
                <View style={{ marginBottom: 6 }}>
                  <IconButton
                    name="trash-outline"
                    color={t.danger}
                    onPress={() => setRemoveIndex(i)}
                    accessibilityLabel="Remove assignment"
                  />
                </View>
              )}
            </View>
            {needsDept && (
              <Select
                label="Department"
                value={a.department}
                options={departments}
                onSelect={(department) => update({ department })}
                placeholder="Choose a department…"
              />
            )}
            {needsUni && (
              <Select
                label="University"
                value={a.university}
                options={universities}
                onSelect={(university) => update({ university })}
                placeholder="Choose a university…"
              />
            )}
            {isChaplain && (
              <Select
                label="University (optional)"
                value={a.university}
                options={[
                  { label: "— None —", value: "" },
                  ...universities.map((u) => ({ label: u, value: u })),
                ]}
                onSelect={(university) => update({ university })}
                placeholder="Choose a university…"
              />
            )}
          </View>
        );
      })}
      <Btn
        title="+ Add Assignment"
        variant="ghost"
        onPress={() => onChange([...assignments, emptyDraft()])}
      />
      <ConfirmDialog
        visible={removeIndex !== null}
        title={
          removeIndex !== null
            ? `Remove the ${formatAssignment(assignments[removeIndex])} assignment?`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeIndex !== null) {
            onChange(assignments.filter((_, j) => j !== removeIndex));
          }
        }}
        onClose={() => setRemoveIndex(null)}
      />
    </View>
  );
};

/** A read-only assignment row matching AssignmentEditor visually, for head roles locked to the Structure tab. */
const LockedAssignmentRow = ({
  a,
  index,
  totalCount,
}: {
  a: Assignment;
  index: number;
  totalCount: number;
}) => {
  const t = useAppTheme();
  const kind = scopeKindFor(a.role);
  const scopeLabel =
    kind === "division" ? "Division" : kind === "university" ? "University" : kind === "department" ? "Department" : null;
  const scopeValue =
    kind === "division" ? (a.division ?? null) : kind === "university" ? (a.university ?? null) : kind === "department" ? (a.department ?? null) : null;
  return (
    <View style={{ backgroundColor: t.ghost, borderRadius: radius.md, padding: 12, gap: 8, opacity: 0.6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[typography.label, { color: t.muted }]}>
            {totalCount > 1 ? `Assignment ${index + 1}` : "Role"}
          </Text>
          <View
            style={{
              borderRadius: radius.md,
              borderWidth: 1.5,
              paddingHorizontal: 14,
              minHeight: 46,
              borderColor: "transparent",
              backgroundColor: t.inputBackground,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={[typography.body, { color: t.text, flex: 1 }]}>{a.role}</Text>
          </View>
        </View>
        <Ionicons name="lock-closed-outline" size={20} color={t.muted} style={{ marginBottom: 12 }} accessibilityLabel="Locked – managed in Structure tab" />
      </View>
      {scopeLabel && scopeValue && (
        <View style={{ gap: 6 }}>
          <Text style={[typography.label, { color: t.muted }]}>{scopeLabel}</Text>
          <View
            style={{
              borderRadius: radius.md,
              borderWidth: 1.5,
              paddingHorizontal: 14,
              minHeight: 46,
              borderColor: "transparent",
              backgroundColor: t.inputBackground,
              justifyContent: "center",
            }}
          >
            <Text style={[typography.body, { color: t.text }]}>{scopeValue}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

export default function AdminScreen() {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const isAdmin = !!me?.isAdmin;
  // The Finance Head (head of the Finance department) gets a restricted view of
  // this screen: the Budget Manager setting only, nothing else.
  const budgetManagerOnly = !isAdmin && !!me?.isFinanceHead;
  const hasAccess = isAdmin || budgetManagerOnly;
  const years = useQuery(api.directory.availableYears, isAdmin ? {} : "skip");
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  // Budget-manager-only callers can't switch years; they manage the live one.
  const selectedYear = budgetManagerOnly ? currentYear : year ?? currentYear;
  const editable = selectedYear === currentYear || selectedYear === currentYear + 1;
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [tab, setTab] = useState<AdminTab>("users");
  const activeTab: AdminTab = budgetManagerOnly ? "other" : tab;
  const [structureSubTab, setStructureSubTab] = useState<StructureSubTab>("roles");
  const scrollRef = useRef<ScrollView>(null);

  const structure = useQuery(
    api.directory.yearStructure,
    hasAccess ? { year: selectedYear } : "skip"
  );
  // Finance department members for the Budget Manager picker (allowed for both
  // admins and the Finance Head).
  const financeMembers = useQuery(
    api.admin.financeMembers,
    hasAccess ? { year: selectedYear } : "skip"
  );
  const profiles = useQuery(
    api.admin.listStaffProfiles,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );
  const unassigned = useQuery(
    api.admin.listUnassignedUsers,
    me?.isAdmin && editable ? { year: selectedYear } : "skip"
  );
  const people = useQuery(
    api.admin.people,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );
  const personOptions = (people ?? []).map((person) => ({
    label: person.name ? `${person.name} (${person.email})` : person.email,
    value: person.email,
  }));
  const nameByEmail = new Map((people ?? []).map((p) => [p.email, p.name]));
  const unassignedEmails = new Set((unassigned ?? []).map((u) => u.email));

  const setStaffProfile = useMutation(api.admin.setStaffProfile);
  const removeStaffProfile = useMutation(api.admin.removeStaffProfile);
  const upsertDivision = useMutation(api.admin.upsertDivision);
  const updateDivision = useMutation(api.admin.updateDivision);
  const removeDivision = useMutation(api.admin.removeDivision);
  const upsertDepartment = useMutation(api.admin.upsertDepartment);
  const updateDepartment = useMutation(api.admin.updateDepartment);
  const removeDepartment = useMutation(api.admin.removeDepartment);
  const upsertUniversity = useMutation(api.admin.upsertUniversity);
  const updateUniversity = useMutation(api.admin.updateUniversity);
  const removeUniversity = useMutation(api.admin.removeUniversity);
  const upsertRole = useMutation(api.admin.upsertRole);
  const updateRole = useMutation(api.admin.updateRole);
  const removeRole = useMutation(api.admin.removeRole);
  const setBudgetManager = useMutation(api.admin.setBudgetManager);
  const requestSync = useMutation(api.directorySync.requestSync);
  const syncState = useQuery(
    api.directorySync.list,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );
  const [syncing, setSyncing] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  // Division / department / university add forms
  const [divisionName, setDivisionName] = useState("");
  const [divisionHead, setDivisionHead] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentDivision, setDepartmentDivision] = useState("");
  const [departmentHead, setDepartmentHead] = useState("");
  // Budget manager form — null means "untouched", showing the current one.
  const [budgetManagerEmail, setBudgetManagerEmail] = useState<string | null>(null);
  const budgetManagerValue =
    budgetManagerEmail ?? structure?.budgetManagerEmail ?? "";

  // Inline editing state for user cards
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState<AssignmentDraft[]>([emptyDraft()]);
  const [savingEditUser, setSavingEditUser] = useState(false);
  // Inline assign state for unassigned user cards
  const [assigningUserEmail, setAssigningUserEmail] = useState<string | null>(null);
  const [assigningAssignments, setAssigningAssignments] = useState<AssignmentDraft[]>([emptyDraft()]);
  const [savingAssign, setSavingAssign] = useState(false);
  // Inline editing state for division cards
  const [editingDivisionKey, setEditingDivisionKey] = useState<string | null>(null);
  const [editingDivisionFormName, setEditingDivisionFormName] = useState("");
  const [editingDivisionFormHead, setEditingDivisionFormHead] = useState("");
  const [savingEditDivision, setSavingEditDivision] = useState(false);
  // Inline editing state for department cards
  const [editingDepartmentKey, setEditingDepartmentKey] = useState<string | null>(null);
  const [editingDepartmentFormName, setEditingDepartmentFormName] = useState("");
  const [editingDepartmentFormDivision, setEditingDepartmentFormDivision] = useState("");
  const [editingDepartmentFormHead, setEditingDepartmentFormHead] = useState("");
  const [savingEditDepartment, setSavingEditDepartment] = useState(false);
  // Inline editing state for university cards
  const [editingUniversityKey, setEditingUniversityKey] = useState<string | null>(null);
  const [editingUniversityFormName, setEditingUniversityFormName] = useState("");
  const [savingEditUniversity, setSavingEditUniversity] = useState(false);
  // Inline editing state for role cards
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [editingRoleFormName, setEditingRoleFormName] = useState("");
  const [savingEditRole, setSavingEditRole] = useState(false);
  // Type-to-confirm delete dialog (divisions / universities / roles / departments)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  // Type-to-confirm dialog for removing a person's profile for the year.
  const [removeProfileTarget, setRemoveProfileTarget] = useState<
    NonNullable<typeof profiles>[number] | null
  >(null);

  const startEditUser = (email: string) => {
    const existing = (profiles ?? []).find((p) => p.email === email);
    const all = existing?.assignments ?? [];
    const nonHead = all.filter(
      (a) => a.role !== HEAD_OF_DEPARTMENT && a.role !== HEAD_OF_DIVISION
    );
    // Seed a blank Staff row only when the profile has NO assignment at all.
    // If they already hold something — even just a head role (shown locked
    // above) — start with an empty editor rather than adding an unselected
    // default Staff assignment.
    let initial: AssignmentDraft[];
    if (nonHead.length > 0) {
      initial = nonHead.map((a) => ({
        role: a.role,
        department: a.department ?? "",
        university: a.university ?? "",
      }));
    } else if (all.length > 0) {
      initial = [];
    } else {
      initial = [emptyDraft()];
    }
    setEditingAssignments(initial);
    setEditingUserEmail(email);
  };

  const startAssign = (email: string) => {
    setAssigningAssignments([emptyDraft()]);
    setAssigningUserEmail(email);
  };

  if (me === undefined) {
    return <Screen><LoadingState /></Screen>;
  }

  if (!hasAccess) {
    return (
      <Screen>
        <Muted>Only admins can access this screen.</Muted>
      </Screen>
    );
  }

  const yearLabel = (y: number) =>
    y === currentYear
      ? `${y} (current)`
      : y === currentYear + 1
        ? `${y} (from Sep 1)`
        : `${y}`;

  // Assignable roles come from the YEAR's role catalog (mirroring universities)
  // minus the head/member roles set through the Structure section. Falls back to
  // the hardcoded list when the year's roles haven't been backfilled yet.
  const yearRoles = structure?.roles ?? [];
  const yearAssignableRoles = yearRoles.filter(
    (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER
  );
  const assignableRoles =
    yearAssignableRoles.length > 0 ? yearAssignableRoles : STAFF_EDITABLE_ROLES;
  // Director can only be assigned when nobody else holds the role this year.
  const directorExists = (profiles ?? []).some((p) =>
    (p.assignments ?? []).some((a) => a.role === DIRECTOR)
  );
  const availableRoles = directorExists
    ? assignableRoles.filter((r) => r !== DIRECTOR)
    : assignableRoles;

  // Profiles grouped by division > department for the org-chart-style list.
  const directoryOnlyUnassigned = (syncState?.users ?? []).filter(
    (u) => !u.hasProfile && !unassignedEmails.has(u.email)
  );
  const groupedProfiles = (structure?.divisions ?? []).map((div) => {
    const seenInDepartments = new Set<string>();
    const divDepts = (structure?.departments ?? []).filter((d) => d.division === div.name);
    const divDeptNames = new Set(divDepts.map((d) => d.name));
    return {
      division: div.name,
      departments: divDepts
        .map((dept) => ({
          name: dept.name,
          profiles: (profiles ?? []).filter((p) => {
            if (seenInDepartments.has(p.email)) return false;
            const inDept = (p.assignments ?? []).some((a) => a.department === dept.name);
            if (inDept) seenInDepartments.add(p.email);
            return inDept;
          }),
        }))
        .filter((d) => d.profiles.length > 0),
      divisionOnlyProfiles: (profiles ?? []).filter((p) => {
        if (!divisionsOf(p).includes(div.name)) return false;
        return !departmentsOf(p).some((dept) => divDeptNames.has(dept));
      }),
    };
  });
  const groupedEmails = new Set(
    groupedProfiles.flatMap((g) => [
      ...g.departments.flatMap((d) => d.profiles.map((p) => p.email)),
      ...g.divisionOnlyProfiles.map((p) => p.email),
    ])
  );
  const otherProfiles = (profiles ?? []).filter((p) => !groupedEmails.has(p.email));

  // Within otherProfiles, group campus roles (SL / Exec / VP / President) by university.
  const campusProfiles = otherProfiles.filter((p) =>
    (p.assignments ?? []).some((a) => a.university)
  );
  const nonCampusOtherProfiles = otherProfiles.filter((p) =>
    !(p.assignments ?? []).some((a) => a.university)
  );
  // Derive university order from structure list, then append any extras found on profiles.
  const structureUnis = structure?.universities ?? [];
  const extraUnis = [
    ...new Set(
      campusProfiles.flatMap((p) =>
        (p.assignments ?? []).flatMap((a) => (a.university ? [a.university] : []))
      )
    ),
  ].filter((u) => !structureUnis.includes(u));
  const campusUniversities = [...structureUnis, ...extraUnis];
  const seenInCampus = new Set<string>();
  const campusByUniversity = campusUniversities
    .map((uni) => ({
      university: uni,
      profiles: campusProfiles.filter((p) => {
        if (seenInCampus.has(p.email)) return false;
        const match = (p.assignments ?? []).some((a) => a.university === uni);
        if (match) seenInCampus.add(p.email);
        return match;
      }),
    }))
    .filter((g) => g.profiles.length > 0);

  // Shared save handler for inline-assign cards (used for both unassigned sections).
  const saveAssign = (email: string) => {
    if (directorExists && assigningAssignments.some((a) => a.role === DIRECTOR)) {
      setError("A Director is already assigned for this year.");
      return;
    }
    setSavingAssign(true);
    void run(() =>
      setStaffProfile({
        email,
        year: selectedYear,
        assignments: assigningAssignments.map((a) => ({
          role: a.role,
          department: a.department || undefined,
          university: a.university || undefined,
        })),
      })
    )
      .then((ok) => {
        if (ok) {
          setAssigningUserEmail(null);
          setToast({ text: `Saved ${email}` });
        }
      })
      .finally(() => setSavingAssign(false));
  };

  // Renders the collapsed or expanded card for an unassigned user.
  const renderUnassignedCard = (user: { email: string; name?: string | null }) => {
    const isAssigning = assigningUserEmail === user.email;
    return (
      <Card key={user.email} style={{ marginBottom: spacing.sm }}>
        {isAssigning ? (
          <>
            <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
            {user.name ? <Muted>{user.email}</Muted> : null}
            <AssignmentEditor
              assignments={assigningAssignments}
              onChange={setAssigningAssignments}
              departments={(structure?.departments ?? []).map((d) => d.name)}
              universities={structure?.universities ?? []}
              roles={availableRoles}
            />
            <Row>
              <Btn
                title="Cancel"
                variant="ghost"
                onPress={() => setAssigningUserEmail(null)}
              />
              <Btn
                title="Save"
                loading={savingAssign}
                onPress={() => saveAssign(user.email)}
              />
            </Row>
          </>
        ) : (
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
              {user.name ? <Muted>{user.email}</Muted> : null}
            </View>
            <Btn
              title="Assign"
              variant="ghost"
              onPress={() => startAssign(user.email)}
            />
          </Row>
        )}
      </Card>
    );
  };

  // Renders the collapsed or expanded card for an assigned profile.
  const renderProfileCard = (profile: NonNullable<typeof profiles>[number]) => {
    const isEditingThis = editingUserEmail === profile.email;
    const lockedHeadAssignments = (profile.assignments ?? []).filter(
      (a) => a.role === HEAD_OF_DEPARTMENT || a.role === HEAD_OF_DIVISION
    );
    return (
      <Card key={profile._id} style={{ marginBottom: spacing.sm }}>
        {isEditingThis ? (
          <>
            <Txt style={{ fontWeight: "600" }}>{profile.name ?? profile.email}</Txt>
            {profile.name ? <Muted>{profile.email}</Muted> : null}
            {lockedHeadAssignments.map((a, i) => (
              <LockedAssignmentRow
                key={i}
                a={a}
                index={i}
                totalCount={lockedHeadAssignments.length + editingAssignments.length}
              />
            ))}
            <AssignmentEditor
              assignments={editingAssignments}
              onChange={setEditingAssignments}
              departments={(structure?.departments ?? []).map((d) => d.name)}
              universities={structure?.universities ?? []}
              roles={availableRoles}
              startIndex={lockedHeadAssignments.length}
              // A head role already covers the profile, so the last non-head
              // assignment can be removed too; otherwise keep at least one.
              minCount={lockedHeadAssignments.length > 0 ? 0 : 1}
            />
            <Row>
              <Btn
                title="Cancel"
                variant="ghost"
                onPress={() => setEditingUserEmail(null)}
              />
              <Btn
                title="Save"
                loading={savingEditUser}
                onPress={() => {
                  const isCurrentDirector = (profile.assignments ?? []).some(
                    (a) => a.role === DIRECTOR
                  );
                  if (
                    directorExists &&
                    !isCurrentDirector &&
                    editingAssignments.some((a) => a.role === DIRECTOR)
                  ) {
                    setError("A Director is already assigned for this year.");
                    return;
                  }
                  setSavingEditUser(true);
                  void run(() =>
                    setStaffProfile({
                      email: profile.email,
                      year: selectedYear,
                      assignments: [
                        ...lockedHeadAssignments,
                        ...editingAssignments.map((a) => ({
                          role: a.role,
                          department: a.department || undefined,
                          university: a.university || undefined,
                        })),
                      ],
                    })
                  )
                    .then((ok) => {
                      if (ok) {
                        setEditingUserEmail(null);
                        setToast({ text: `Saved ${profile.email}` });
                      }
                    })
                    .finally(() => setSavingEditUser(false));
                }}
              />
            </Row>
          </>
        ) : (
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Txt style={{ fontWeight: "600" }}>{profile.name ?? profile.email}</Txt>
              {profile.name ? <Muted>{profile.email}</Muted> : null}
              {(profile.assignments ?? []).length > 0 ? (
                <View style={{ marginTop: 2 }}>
                  {(profile.assignments ?? []).map((a, i) => (
                    <Muted key={i}>{formatAssignment(a)}</Muted>
                  ))}
                </View>
              ) : (
                <Muted>—</Muted>
              )}
            </View>
            {editable && (
              <>
                <IconButton
                  name="create-outline"
                  onPress={() => startEditUser(profile.email)}
                />
                <IconButton
                  name="trash-outline"
                  color={t.danger}
                  onPress={() => setRemoveProfileTarget(profile)}
                />
              </>
            )}
          </Row>
        )}
      </Card>
    );
  };

  return (
    <Screen
      toast={toast}
      scrollRef={scrollRef}
      title="Manage"
      headerRight={
        budgetManagerOnly ? undefined : (
          <Pressable
            style={({ pressed }) => [
              styles.yearPill,
              t.shadowCard,
              { backgroundColor: t.card },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setYearMenuOpen(true)}
          >
            <Txt style={{ fontWeight: "700" }}>{selectedYear}</Txt>
            <Ionicons name="chevron-down" size={14} color={t.muted} />
          </Pressable>
        )
      }
    >
      <ConfirmDialog
        visible={deleteConfirm !== null}
        title={`Delete "${deleteConfirm?.name}"`}
        message={deleteConfirm?.message}
        requireText={deleteConfirm?.name}
        onConfirm={() => deleteConfirm?.onConfirm()}
        onClose={() => setDeleteConfirm(null)}
      />

      <ConfirmDialog
        visible={removeProfileTarget !== null}
        title={`Delete "${removeProfileTarget?.name ?? removeProfileTarget?.email}"`}
        message={`Remove ${removeProfileTarget?.email} from ${selectedYear}? Their roles and department assignments for the year will be deleted.`}
        requireText={removeProfileTarget?.name ?? removeProfileTarget?.email}
        onConfirm={() => {
          if (removeProfileTarget) {
            void run(() =>
              removeStaffProfile({
                email: removeProfileTarget.email,
                year: selectedYear,
              })
            );
          }
        }}
        onClose={() => setRemoveProfileTarget(null)}
      />

      <ConfirmDialog
        visible={syncConfirm}
        title="Sync directory now?"
        message="Pulls all active Google Workspace users on sow.org.au into the people picker. This also runs automatically every day."
        destructive={false}
        confirmLabel="Sync"
        onConfirm={() => {
          setSyncing(true);
          void run(() => requestSync({})).finally(() => setSyncing(false));
        }}
        onClose={() => setSyncConfirm(false)}
      />

      <OptionSheet
        visible={yearMenuOpen}
        title="Year"
        onClose={() => setYearMenuOpen(false)}
      >
        {(years ?? [currentYear, currentYear + 1]).map((y) => (
          <OptionRow
            key={y}
            label={yearLabel(y)}
            selected={y === selectedYear}
            onPress={() => {
              setYear(y);
              setYearMenuOpen(false);
              setEditingUserEmail(null);
              setAssigningUserEmail(null);
              setEditingDivisionKey(null);
              setEditingDepartmentKey(null);
              setEditingUniversityKey(null);
              setEditingRoleKey(null);
            }}
          />
        ))}
      </OptionSheet>

      {!budgetManagerOnly && (
        <Segmented
          segments={ADMIN_TABS}
          active={tab}
          onChange={(key) => { setTab(key as AdminTab); setError(null); }}
        />
      )}

      <ErrorBanner message={error} />

      {activeTab === "users" && (
        <>
          {editable && (unassigned ?? []).length > 0 && (
            <>
              <SectionTitle>Signed in, no assignment — {selectedYear}</SectionTitle>
              {(unassigned ?? []).map((user) => renderUnassignedCard(user))}
            </>
          )}

          {editable && directoryOnlyUnassigned.length > 0 && (
            <>
              <SectionTitle>
                In directory, no assignment — {selectedYear} ({directoryOnlyUnassigned.length})
              </SectionTitle>
              {directoryOnlyUnassigned.map((user) => renderUnassignedCard(user))}
            </>
          )}

          {/* Profiles grouped by division > department */}
          {groupedProfiles.map((group) => {
            const hasAny = group.departments.length > 0 || group.divisionOnlyProfiles.length > 0;
            if (!hasAny) return null;
            return (
              <View key={group.division}>
                <SectionTitle>{group.division} — {selectedYear}</SectionTitle>
                {group.departments.map((dept) => (
                  <View key={dept.name}>
                    <Text
                      style={[
                        typography.label,
                        { color: t.muted, paddingHorizontal: 4, paddingBottom: 4, paddingTop: 8 },
                      ]}
                    >
                      {dept.name}
                    </Text>
                    {dept.profiles.map((profile) => renderProfileCard(profile))}
                  </View>
                ))}
                {group.divisionOnlyProfiles.map((profile) => renderProfileCard(profile))}
              </View>
            );
          })}

          {/* Campus roles grouped by university */}
          {campusByUniversity.map((group) => (
            <View key={group.university}>
              <SectionTitle>{group.university} — {selectedYear}</SectionTitle>
              {group.profiles.map((profile) => renderProfileCard(profile))}
            </View>
          ))}

          {/* Profiles not in any division, department, or campus */}
          {nonCampusOtherProfiles.length > 0 && (
            <>
              <SectionTitle>Other — {selectedYear}</SectionTitle>
              {nonCampusOtherProfiles.map((profile) => renderProfileCard(profile))}
            </>
          )}
        </>
      )}

      {activeTab === "structure" && (
        <>
          <Segmented
            segments={STRUCTURE_SUB_TABS}
            active={structureSubTab}
            onChange={(key) => setStructureSubTab(key as StructureSubTab)}
          />

          {structureSubTab === "roles" && (
            <>
          <SectionTitle>Roles — {selectedYear}</SectionTitle>
          {(structure?.roles ?? []).length === 0 && (
            <Card><Muted>No roles yet.</Muted></Card>
          )}
          {(structure?.roles ?? []).map((role) => {
            const isEditingThis = editingRoleKey === role;
            return (
              <Card key={role}>
                {isEditingThis ? (
                  <>
                    <Field
                      label="Role name (rename cascades to staff assignments)"
                      value={editingRoleFormName}
                      onChangeText={setEditingRoleFormName}
                    />
                    <Row>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingRoleKey(null)}
                      />
                      <Btn
                        title="Save"
                        loading={savingEditRole}
                        onPress={() => {
                          setSavingEditRole(true);
                          void run(() =>
                            updateRole({
                              year: selectedYear,
                              oldName: role,
                              newName: editingRoleFormName,
                            })
                          )
                            .then((ok) => {
                              if (ok) setEditingRoleKey(null);
                            })
                            .finally(() => setSavingEditRole(false));
                        }}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{role}</Txt>
                    </View>
                    {editable && (
                      <>
                        <IconButton
                          name="create-outline"
                          onPress={() => {
                            setEditingRoleFormName(role);
                            setEditingRoleKey(role);
                          }}
                        />
                        <IconButton
                          name="trash-outline"
                          color={t.danger}
                          onPress={() =>
                            setDeleteConfirm({
                              name: role,
                              message: `This role can only be deleted if no one is assigned it this year.`,
                              onConfirm: () => void run(() => removeRole({ year: selectedYear, name: role })),
                            })
                          }
                        />
                      </>
                    )}
                  </Row>
                )}
              </Card>
            );
          })}
          {editable && (
            <Card>
              <Field
                label="New role"
                value={roleName}
                onChangeText={setRoleName}
              />
              <Btn
                title="Add Role"
                onPress={() =>
                  void run(() =>
                    upsertRole({ year: selectedYear, name: roleName })
                  ).then((ok) => ok && setRoleName(""))
                }
              />
            </Card>
          )}
            </>
          )}

          {structureSubTab === "divisions" && (
            <>
          <SectionTitle>Divisions — {selectedYear}</SectionTitle>
          {(structure?.divisions ?? []).map((division) => {
            const isEditingThis = editingDivisionKey === division.name;
            return (
              <Card key={division.name}>
                {isEditingThis ? (
                  <>
                    <Field
                      label="Division name (rename cascades to departments and staff)"
                      value={editingDivisionFormName}
                      onChangeText={setEditingDivisionFormName}
                    />
                    <Select
                      label="Head of Division (optional — also gives them the role)"
                      value={editingDivisionFormHead}
                      options={[{ label: "— No head —", value: "" }, ...personOptions]}
                      onSelect={setEditingDivisionFormHead}
                      placeholder="Choose a person…"
                    />
                    <Row>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDivisionKey(null)}
                      />
                      <Btn
                        title="Save"
                        loading={savingEditDivision}
                        onPress={() => {
                          setSavingEditDivision(true);
                          void run(() =>
                            updateDivision({
                              year: selectedYear,
                              oldName: division.name,
                              newName: editingDivisionFormName,
                              headEmail: editingDivisionFormHead || undefined,
                            })
                          )
                            .then((ok) => {
                              if (ok) setEditingDivisionKey(null);
                            })
                            .finally(() => setSavingEditDivision(false));
                        }}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{division.name}</Txt>
                      {division.headEmail ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 }}>
                          <Ionicons name="person-outline" size={12} color={t.muted} />
                          <Muted>{nameByEmail.get(division.headEmail) ?? division.headEmail}</Muted>
                        </View>
                      ) : (
                        <Muted>No head assigned</Muted>
                      )}
                    </View>
                    {editable && (
                      <>
                        <IconButton
                          name="create-outline"
                          onPress={() => {
                            setEditingDivisionFormName(division.name);
                            setEditingDivisionFormHead(division.headEmail ?? "");
                            setEditingDivisionKey(division.name);
                          }}
                        />
                        <IconButton
                          name="trash-outline"
                          color={t.danger}
                          onPress={() =>
                            setDeleteConfirm({
                              name: division.name,
                              message: `Its departments and all staff assignments in this division will also be removed.`,
                              onConfirm: () => void run(() => removeDivision({ year: selectedYear, name: division.name })),
                            })
                          }
                        />
                      </>
                    )}
                  </Row>
                )}
              </Card>
            );
          })}
          {editable && (
            <Card>
              <Field
                label="New division name"
                value={divisionName}
                onChangeText={setDivisionName}
              />
              <Select
                label="Head of Division (optional — also gives them the role; a person can head several divisions)"
                value={divisionHead}
                options={[{ label: "— No head —", value: "" }, ...personOptions]}
                onSelect={setDivisionHead}
                placeholder="Choose a person…"
              />
              <Btn
                title="Add Division"
                onPress={() =>
                  void run(() =>
                    upsertDivision({
                      year: selectedYear,
                      name: divisionName,
                      headEmail: divisionHead || undefined,
                    })
                  ).then((ok) => {
                    if (ok) {
                      setDivisionName("");
                      setDivisionHead("");
                    }
                  })
                }
              />
            </Card>
          )}
            </>
          )}

          {structureSubTab === "universities" && (
            <>
          <SectionTitle>Universities — {selectedYear}</SectionTitle>
          {(structure?.universities ?? []).length === 0 && (
            <Card><Muted>No universities yet.</Muted></Card>
          )}
          {(structure?.universities ?? []).map((university) => {
            const isEditingThis = editingUniversityKey === university;
            return (
              <Card key={university}>
                {isEditingThis ? (
                  <>
                    <Field
                      label="University name (rename cascades to staff)"
                      value={editingUniversityFormName}
                      onChangeText={setEditingUniversityFormName}
                    />
                    <Row>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingUniversityKey(null)}
                      />
                      <Btn
                        title="Save"
                        loading={savingEditUniversity}
                        onPress={() => {
                          setSavingEditUniversity(true);
                          void run(() =>
                            updateUniversity({
                              year: selectedYear,
                              oldName: university,
                              newName: editingUniversityFormName,
                            })
                          )
                            .then((ok) => {
                              if (ok) setEditingUniversityKey(null);
                            })
                            .finally(() => setSavingEditUniversity(false));
                        }}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{university}</Txt>
                    </View>
                    {editable && (
                      <>
                        <IconButton
                          name="create-outline"
                          onPress={() => {
                            setEditingUniversityFormName(university);
                            setEditingUniversityKey(university);
                          }}
                        />
                        <IconButton
                          name="trash-outline"
                          color={t.danger}
                          onPress={() =>
                            setDeleteConfirm({
                              name: university,
                              message: `All campus assignments for this university will also be removed.`,
                              onConfirm: () => void run(() => removeUniversity({ year: selectedYear, name: university })),
                            })
                          }
                        />
                      </>
                    )}
                  </Row>
                )}
              </Card>
            );
          })}
          {editable && (
            <Card>
              <Field
                label="New university"
                value={universityName}
                onChangeText={setUniversityName}
              />
              <Btn
                title="Add University"
                onPress={() =>
                  void run(() =>
                    upsertUniversity({ year: selectedYear, name: universityName })
                  ).then((ok) => ok && setUniversityName(""))
                }
              />
            </Card>
          )}
            </>
          )}

          {structureSubTab === "departments" && (
            <>
          <SectionTitle>Departments — {selectedYear}</SectionTitle>
          {(structure?.departments ?? []).map((department) => {
            const isEditingThis = editingDepartmentKey === department.name;
            return (
              <Card key={department.name}>
                {isEditingThis ? (
                  <>
                    <Field
                      label="Department name (rename cascades to staff and requests)"
                      value={editingDepartmentFormName}
                      onChangeText={setEditingDepartmentFormName}
                    />
                    <Select
                      label="Division"
                      value={editingDepartmentFormDivision}
                      options={(structure?.divisions ?? []).map((d) => d.name)}
                      onSelect={setEditingDepartmentFormDivision}
                      placeholder="Choose a division…"
                    />
                    <Select
                      label="Head of Department (optional — also gives them the role)"
                      value={editingDepartmentFormHead}
                      options={[{ label: "— No head —", value: "" }, ...personOptions]}
                      onSelect={setEditingDepartmentFormHead}
                      placeholder="Choose a person…"
                    />
                    <Row>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDepartmentKey(null)}
                      />
                      <Btn
                        title="Save"
                        loading={savingEditDepartment}
                        onPress={() => {
                          setSavingEditDepartment(true);
                          void run(() =>
                            updateDepartment({
                              year: selectedYear,
                              oldName: department.name,
                              newName: editingDepartmentFormName,
                              division: editingDepartmentFormDivision,
                              headEmail: editingDepartmentFormHead || undefined,
                            })
                          )
                            .then((ok) => {
                              if (ok) setEditingDepartmentKey(null);
                            })
                            .finally(() => setSavingEditDepartment(false));
                        }}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{department.name}</Txt>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2, flexWrap: "wrap" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                          <Ionicons name="git-branch-outline" size={12} color={t.muted} />
                          <Muted>{department.division}</Muted>
                        </View>
                        {department.headEmail && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                            <Ionicons name="person-outline" size={12} color={t.muted} />
                            <Muted>{nameByEmail.get(department.headEmail) ?? department.headEmail}</Muted>
                          </View>
                        )}
                      </View>
                    </View>
                    {editable && (
                      <>
                        <IconButton
                          name="create-outline"
                          onPress={() => {
                            setEditingDepartmentFormName(department.name);
                            setEditingDepartmentFormDivision(department.division);
                            setEditingDepartmentFormHead(department.headEmail ?? "");
                            setEditingDepartmentKey(department.name);
                          }}
                        />
                        <IconButton
                          name="trash-outline"
                          color={t.danger}
                          onPress={() =>
                            setDeleteConfirm({
                              name: department.name,
                              message: `All staff assignments to this department will also be removed.`,
                              onConfirm: () => void run(() => removeDepartment({ year: selectedYear, name: department.name })),
                            })
                          }
                        />
                      </>
                    )}
                  </Row>
                )}
              </Card>
            );
          })}
          {editable && (
            <Card>
              <Field
                label="New department name"
                value={departmentName}
                onChangeText={setDepartmentName}
              />
              <Select
                label="Division"
                value={departmentDivision}
                options={(structure?.divisions ?? []).map((d) => d.name)}
                onSelect={setDepartmentDivision}
                placeholder="Choose a division…"
              />
              <Select
                label="Head of Department (optional — also gives them the role)"
                value={departmentHead}
                options={[{ label: "— No head —", value: "" }, ...personOptions]}
                onSelect={setDepartmentHead}
                placeholder="Choose a person…"
              />
              <Btn
                title="Add Department"
                onPress={() =>
                  void run(() =>
                    upsertDepartment({
                      year: selectedYear,
                      name: departmentName,
                      division: departmentDivision,
                      headEmail: departmentHead || undefined,
                    })
                  ).then((ok) => ok && setDepartmentName(""))
                }
              />
            </Card>
          )}
            </>
          )}
        </>
      )}

      {activeTab === "other" && (
        <>
          {isAdmin && (
            <>
              <SectionTitle>Directory Sync</SectionTitle>
              <Card>
                <Muted>
                  Syncs all active Google Workspace users on sow.org.au into the
                  people picker. Runs automatically every day.
                </Muted>
                {syncState?.syncedAt ? (
                  <Muted>
                    Last synced:{" "}
                    {new Date(syncState.syncedAt).toLocaleString()} —{" "}
                    {syncState.status}
                  </Muted>
                ) : (
                  <Muted>Never synced.</Muted>
                )}
                <Btn
                  title={syncing ? "Syncing…" : "Sync Directory Now"}
                  loading={syncing}
                  onPress={() => setSyncConfirm(true)}
                />
              </Card>
            </>
          )}

          <SectionTitle>Budget Manager — {selectedYear}</SectionTitle>
          <Card>
            {editable ? (
              <>
                <Select
                  label="Budget Manager (Finance department members)"
                  value={budgetManagerValue}
                  options={(financeMembers ?? []).map((person) => ({
                    label: person.name
                      ? `${person.name} (${person.email})`
                      : person.email,
                    value: person.email,
                  }))}
                  onSelect={setBudgetManagerEmail}
                  placeholder="Choose a Finance member…"
                />
                <Btn
                  title="Set Budget Manager"
                  disabled={!budgetManagerValue}
                  onPress={() =>
                    void run(() =>
                      setBudgetManager({
                        year: selectedYear,
                        email: budgetManagerValue,
                      })
                    ).then((ok) => ok && setBudgetManagerEmail(null))
                  }
                />
              </>
            ) : (
              <Select
                label="Budget Manager (Finance department members)"
                value={structure?.budgetManagerEmail ?? ""}
                options={(financeMembers ?? []).map((person) => ({
                  label: person.name
                    ? `${person.name} (${person.email})`
                    : person.email,
                  value: person.email,
                }))}
                onSelect={() => {}}
                disabled
                placeholder="Not set"
              />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  yearPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
