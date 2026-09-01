import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  type Assignment,
  DIRECTOR,
  DIRECTOR_APPROVAL_THRESHOLD,
  formatAssignment,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isChaplainRole,
  isSystemRole,
  MEMBER,
  ROLES,
  roleNeedsDepartment,
  roleNeedsUniversity,
  scopeKindFor,
  universityColour,
} from "@shared/flow";
import { api } from "@convex/_generated/api";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import {
  Btn,
  Card,
  ConfirmDialog,
  currencyText,
  formatAmount,
  ErrorBanner,
  errorMessage,
  Field,
  FloatingYearPicker,
  Grid,
  IconButton,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Select,
  type ToastState,
  Toast,
  Txt,
} from "@/components/ui";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { useAdminMutations } from "@/hooks/useAdminMutations";
import { useGroupedProfiles } from "@/hooks/useGroupedProfiles";

type DeleteConfirm = { name: string; message: string; onConfirm: () => void };

const ADMIN_CARD_WIDTH = 360;

const CardGrid = ({ children }: { children: ReactNode }) => (
  <Grid fixedWidth={ADMIN_CARD_WIDTH} align="start">
    {children}
  </Grid>
);

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

const STAFF_EDITABLE_ROLES = ROLES.filter(
  (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER
);

const uniqueByEmail = <T extends { email: string }>(rows: T[]): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.email)) continue;
    seen.add(row.email);
    out.push(row);
  }
  return out;
};

type AssignmentDraft = { role: string; department: string; university: string };
const emptyDraft = (role = STAFF_EDITABLE_ROLES[0]): AssignmentDraft => ({
  role,
  department: "",
  university: "",
});

const sameAssignments = (a: AssignmentDraft[], b: AssignmentDraft[]): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.role === b[i].role &&
      x.department === b[i].department &&
      x.university === b[i].university
  );

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
  minCount?: number;
}) => {
  const t = useAppTheme();
  const totalCount = startIndex + assignments.length;
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
  const budgetManagerOnly = !isAdmin && !!me?.isFinanceHead;
  const hasAccess = isAdmin || budgetManagerOnly;
  const years = useQuery(api.directory.availableYears, isAdmin ? {} : "skip");
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = budgetManagerOnly ? currentYear : year ?? currentYear;
  const editable = selectedYear === currentYear || selectedYear === currentYear + 1;
  const [tab, setTab] = useState<AdminTab>("users");
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (tabParam === "users" || tabParam === "structure" || tabParam === "other") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link tab param
      setTab(tabParam);
    }
  }, [tabParam]);
  const activeTab: AdminTab = budgetManagerOnly ? "other" : tab;
  const [structureSubTab, setStructureSubTab] = useState<StructureSubTab>("roles");

  const structure = useQuery(
    api.directory.yearStructure,
    hasAccess ? { year: selectedYear } : "skip"
  );
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
  const leavers = useQuery(
    api.admin.listLeavers,
    me?.isAdmin && editable ? { year: selectedYear } : "skip"
  );
  const people = useQuery(
    api.admin.people,
    hasAccess ? { year: selectedYear } : "skip"
  );
  const personOptions = (people ?? []).map((person) => ({
    label: person.name ?? person.email,
    value: person.email,
  }));
  const nameByEmail = new Map((people ?? []).map((p) => [p.email, p.name]));
  const unassignedEmails = new Set((unassigned ?? []).map((u) => u.email));

  const { director, groupedProfiles, campusByUniversity, nonCampusOtherProfiles } =
    useGroupedProfiles(structure, profiles);

  const {
    setStaffProfile,
    removeStaffProfile,
    markLeaving,
    unmarkLeaving,
    upsertDivision,
    updateDivision,
    removeDivision,
    upsertDepartment,
    updateDepartment,
    removeDepartment,
    upsertUniversity,
    updateUniversity,
    removeUniversity,
    upsertRole,
    updateRole,
    removeRole,
    setBudgetManager,
    setDirectorThreshold,
    addDelegation,
    removeDelegation,
  } = useAdminMutations();
  const delegations = useQuery(
    api.admin.listDelegations,
    hasAccess ? { year: selectedYear } : "skip"
  );
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

  const [divisionName, setDivisionName] = useState("");
  const [divisionHead, setDivisionHead] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentDivision, setDepartmentDivision] = useState("");
  const [departmentHead, setDepartmentHead] = useState("");
  const [budgetManagerEmail, setBudgetManagerEmail] = useState<string | null>(null);
  const budgetManagerValue =
    budgetManagerEmail ?? structure?.budgetManagerEmail ?? "";
  const [thresholdInput, setThresholdInput] = useState<string | null>(null);
  const configuredThreshold = structure?.directorApprovalThreshold ?? null;
  const thresholdValue =
    thresholdInput ?? String(configuredThreshold ?? DIRECTOR_APPROVAL_THRESHOLD);
  const thresholdNumber = Number(thresholdValue);
  const thresholdUnchanged =
    thresholdNumber === configuredThreshold || thresholdValue.trim() === "";
  const [delegationFrom, setDelegationFrom] = useState("");
  const [delegationTo, setDelegationTo] = useState("");

  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState<AssignmentDraft[]>([emptyDraft()]);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [assigningUserEmail, setAssigningUserEmail] = useState<string | null>(null);
  const [assigningAssignments, setAssigningAssignments] = useState<AssignmentDraft[]>([emptyDraft()]);
  const [savingAssign, setSavingAssign] = useState(false);
  const [editingDivisionKey, setEditingDivisionKey] = useState<string | null>(null);
  const [editingDivisionFormName, setEditingDivisionFormName] = useState("");
  const [editingDivisionFormHead, setEditingDivisionFormHead] = useState("");
  const [savingEditDivision, setSavingEditDivision] = useState(false);
  const [editingDepartmentKey, setEditingDepartmentKey] = useState<string | null>(null);
  const [editingDepartmentFormName, setEditingDepartmentFormName] = useState("");
  const [editingDepartmentFormDivision, setEditingDepartmentFormDivision] = useState("");
  const [editingDepartmentFormHead, setEditingDepartmentFormHead] = useState("");
  const [savingEditDepartment, setSavingEditDepartment] = useState(false);
  const [editingUniversityKey, setEditingUniversityKey] = useState<string | null>(null);
  const [editingUniversityFormName, setEditingUniversityFormName] = useState("");
  const [savingEditUniversity, setSavingEditUniversity] = useState(false);
  const [editingRoleKey, setEditingRoleKey] = useState<string | null>(null);
  const [editingRoleFormName, setEditingRoleFormName] = useState("");
  const [savingEditRole, setSavingEditRole] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [removeProfileTarget, setRemoveProfileTarget] = useState<
    NonNullable<typeof profiles>[number] | null
  >(null);
  const [removeDelegationTarget, setRemoveDelegationTarget] = useState<
    NonNullable<typeof delegations>[number] | null
  >(null);

  const startEditUser = (email: string) => {
    const existing = (profiles ?? []).find((p) => p.email === email);
    const all = existing?.assignments ?? [];
    const nonHead = all.filter(
      (a) => a.role !== HEAD_OF_DEPARTMENT && a.role !== HEAD_OF_DIVISION
    );
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
        ? `${y} (from Oct 1)`
        : `${y}`;

  const yearRoles = structure?.roles ?? [];
  const yearAssignableRoles = yearRoles.filter(
    (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER
  );
  const assignableRoles =
    yearAssignableRoles.length > 0 ? yearAssignableRoles : STAFF_EDITABLE_ROLES;
  const directorExists = (profiles ?? []).some((p) =>
    (p.assignments ?? []).some((a) => a.role === DIRECTOR)
  );
  const availableRoles = directorExists
    ? assignableRoles.filter((r) => r !== DIRECTOR)
    : assignableRoles;

  const divisionNames = (structure?.divisions ?? []).map((d) => d.name);
  const selectedDepartmentDivision = divisionNames.includes(departmentDivision)
    ? departmentDivision
    : "";

  const leaverEmails = new Set((leavers ?? []).map((u) => u.email));
  const directoryOnlyUnassigned = (syncState?.users ?? []).filter(
    (u) => !u.hasProfile && !unassignedEmails.has(u.email) && !leaverEmails.has(u.email)
  );
  const returningByEmail = new Map<
    string,
    { email: string; name?: string | null; previousYear?: number | null }
  >();
  for (const user of unassigned ?? []) {
    if (user.previousYear != null) returningByEmail.set(user.email, user);
  }
  for (const user of directoryOnlyUnassigned) {
    if (user.previousYear != null && !returningByEmail.has(user.email)) {
      returningByEmail.set(user.email, user);
    }
  }
  const signedInNeverStaff = uniqueByEmail(
    (unassigned ?? []).filter((u) => u.previousYear == null)
  );
  const directoryNeverStaff = uniqueByEmail(
    directoryOnlyUnassigned.filter((u) => u.previousYear == null)
  );
  const returningStaff = uniqueByEmail([...returningByEmail.values()]);

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

  const renderUnassignedCard = (user: {
    email: string;
    name?: string | null;
    previousYear?: number | null;
  }) => {
    const isAssigning = assigningUserEmail === user.email;
    return (
      <Card key={user.email}>
        {isAssigning ? (
          <>
            <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
            {user.name ? <Muted>{user.email}</Muted> : null}
            {user.previousYear ? (
              <Muted>Last on staff in {user.previousYear}</Muted>
            ) : null}
            <AssignmentEditor
              assignments={assigningAssignments}
              onChange={setAssigningAssignments}
              departments={(structure?.departments ?? []).map((d) => d.name)}
              universities={structure?.universities ?? []}
              roles={availableRoles}
            />
            <Row spread loading={savingAssign}>
              <Btn
                title="Cancel"
                variant="ghost"
                onPress={() => setAssigningUserEmail(null)}
              />
              <Btn
                title="Save"
                onPress={() => saveAssign(user.email)}
              />
            </Row>
          </>
        ) : (
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
              {user.name ? <Muted>{user.email}</Muted> : null}
              {user.previousYear ? (
                <Muted>Last on staff in {user.previousYear}</Muted>
              ) : null}
            </View>
            <IconButton
              name="log-out-outline"
              size={40}
              color={t.danger}
              accessibilityLabel="Leaving"
              onPress={() =>
                void run(() =>
                  markLeaving({ email: user.email, year: selectedYear })
                )
              }
            />
            <IconButton
              name="person-add-outline"
              size={40}
              accessibilityLabel="Assign"
              onPress={() => startAssign(user.email)}
            />
          </Row>
        )}
      </Card>
    );
  };

  const renderLeaverCard = (user: { email: string; name?: string | null }) => (
    <Card key={user.email}>
      <Row>
        <View style={{ flexGrow: 1 }}>
          <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
          {user.name ? <Muted>{user.email}</Muted> : null}
        </View>
        <Btn
          title="Move to unassigned"
          variant="ghost"
          onPress={() =>
            void run(() =>
              unmarkLeaving({ email: user.email, year: selectedYear })
            )
          }
        />
      </Row>
    </Card>
  );

  const accentBorderWidth = 4;
  const cardHorizontalPadding = spacing.lg + 2;
  const accentContainerStyle = (_accentColour: string) => ({
    gap: spacing.md,
  });
  const accentCardStyle = (accentColour: string) => ({
    borderLeftWidth: accentBorderWidth,
    borderLeftColor: accentColour,
    paddingLeft: cardHorizontalPadding - accentBorderWidth,
  });

  const renderProfileCard = (
    profile: NonNullable<typeof profiles>[number],
    accentColour?: string | null
  ) => {
    const isEditingThis = editingUserEmail === profile.email;
    const lockedHeadAssignments = (profile.assignments ?? []).filter(
      (a) => a.role === HEAD_OF_DEPARTMENT || a.role === HEAD_OF_DIVISION
    );
    const savedAssignments: AssignmentDraft[] = (profile.assignments ?? [])
      .filter((a) => a.role !== HEAD_OF_DEPARTMENT && a.role !== HEAD_OF_DIVISION)
      .map((a) => ({
        role: a.role,
        department: a.department ?? "",
        university: a.university ?? "",
      }));
    const assignmentsChanged = !sameAssignments(editingAssignments, savedAssignments);
    return (
      <Card
        key={profile._id}
        style={accentColour ? accentCardStyle(accentColour) : undefined}
      >
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
              minCount={lockedHeadAssignments.length > 0 ? 0 : 1}
            />
            <Row spread loading={savingEditUser}>
              <Btn
                title="Cancel"
                variant="ghost"
                onPress={() => setEditingUserEmail(null)}
              />
              <Btn
                title="Save"
                disabled={!assignmentsChanged}
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
                  size={40}
                  onPress={() => startEditUser(profile.email)}
                />
                <IconButton
                  name="trash-outline"
                  size={40}
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

  const onSelectYear = (y: number) => {
    setYear(y);
    setError(null);
    setThresholdInput(null);
    setBudgetManagerEmail(null);
    setEditingUserEmail(null);
    setAssigningUserEmail(null);
    setEditingDivisionKey(null);
    setEditingDepartmentKey(null);
    setEditingUniversityKey(null);
    setEditingRoleKey(null);
  };

  const renderTabContent = (key: AdminTab) => (
    <>
      <ErrorBanner message={error} />

      {key === "users" && (
        <>
          {editable && returningStaff.length > 0 && (
            <>
              <SectionTitle>
                Previously staff · {selectedYear} ({returningStaff.length})
              </SectionTitle>
              <CardGrid>
                {returningStaff.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {editable && signedInNeverStaff.length > 0 && (
            <>
              <SectionTitle>Signed in, no assignment · {selectedYear}</SectionTitle>
              <CardGrid>
                {signedInNeverStaff.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {editable && directoryNeverStaff.length > 0 && (
            <>
              <SectionTitle>
                In directory, no assignment · {selectedYear} ({directoryNeverStaff.length})
              </SectionTitle>
              <CardGrid>
                {directoryNeverStaff.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {editable && (leavers ?? []).length > 0 && (
            <>
              <SectionTitle>
                Leaving · {selectedYear} ({(leavers ?? []).length})
              </SectionTitle>
              <CardGrid>
                {(leavers ?? []).map((user) => renderLeaverCard(user))}
              </CardGrid>
            </>
          )}

          {director ? (
            <>
              <SectionTitle>Director · {selectedYear}</SectionTitle>
              <CardGrid>{renderProfileCard(director, t.primary)}</CardGrid>
            </>
          ) : null}

          {groupedProfiles.map((group) => {
            const hasAny =
              group.head ||
              group.departments.length > 0 ||
              group.divisionOnlyProfiles.length > 0;
            if (!hasAny) return null;
            return (
              <View key={group.division} style={{ gap: spacing.md }}>
                <SectionTitle>{group.division} · {selectedYear}</SectionTitle>
                {group.head ? (
                  <CardGrid>{renderProfileCard(group.head, t.primary)}</CardGrid>
                ) : null}
                {group.departments.map((dept) => {
                  const deptAccent = dept.colour ?? t.primary;
                  return (
                    <View
                      key={dept.name}
                      style={accentContainerStyle(deptAccent)}
                    >
                      <Text
                        style={[
                          typography.label,
                          { color: t.muted, paddingTop: 4 },
                        ]}
                      >
                        {dept.name}
                      </Text>
                      <CardGrid>
                        {dept.head ? renderProfileCard(dept.head, deptAccent) : null}
                        {dept.profiles.map((profile) =>
                          renderProfileCard(profile, deptAccent)
                        )}
                      </CardGrid>
                    </View>
                  );
                })}
                {group.divisionOnlyProfiles.length > 0 && (
                  <CardGrid>
                    {group.divisionOnlyProfiles.map((profile) =>
                      renderProfileCard(profile, t.primary)
                    )}
                  </CardGrid>
                )}
              </View>
            );
          })}

          {campusByUniversity.map((group) => {
            const campusAccent = universityColour(group.university) ?? t.primary;
            return (
              <View
                key={group.university}
                style={accentContainerStyle(campusAccent)}
              >
                <SectionTitle>{group.university} · {selectedYear}</SectionTitle>
                <CardGrid>
                  {group.profiles.map((profile) =>
                    renderProfileCard(profile, campusAccent)
                  )}
                </CardGrid>
              </View>
            );
          })}

          {nonCampusOtherProfiles.length > 0 && (
            <>
              <SectionTitle>Other · {selectedYear}</SectionTitle>
              <CardGrid>
                {nonCampusOtherProfiles.map((profile) => renderProfileCard(profile))}
              </CardGrid>
            </>
          )}
        </>
      )}

      {key === "structure" && (
        <>
          <ReadableColumn>
            <Segmented
              segments={STRUCTURE_SUB_TABS}
              active={structureSubTab}
              onChange={(key) => setStructureSubTab(key as StructureSubTab)}
            />
          </ReadableColumn>

          {structureSubTab === "roles" && (
            <>
          <SectionTitle>Roles · {selectedYear}</SectionTitle>
          <CardGrid>
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
                    <Row spread loading={savingEditRole}>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingRoleKey(null)}
                      />
                      <Btn
                        title="Save"
                        disabled={
                          !editingRoleFormName.trim() ||
                          editingRoleFormName.trim() === role
                        }
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
                    {editable && isSystemRole(role) && (
                      <Ionicons
                        name="lock-closed-outline"
                        size={20}
                        color={t.muted}
                        accessibilityLabel="Managed by the app. Can't be renamed or deleted"
                      />
                    )}
                    {editable && !isSystemRole(role) && (
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "divisions" && (
            <>
          <SectionTitle>Divisions · {selectedYear}</SectionTitle>
          <CardGrid>
          {editable && (
            <Card>
              <Field
                label="New division name"
                value={divisionName}
                onChangeText={setDivisionName}
              />
              <Select
                label="Head of Division (a person can head several divisions)"
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
                      label="Head of Division"
                      value={editingDivisionFormHead}
                      options={[{ label: "— No head —", value: "" }, ...personOptions]}
                      onSelect={setEditingDivisionFormHead}
                      placeholder="Choose a person…"
                    />
                    <Row spread loading={savingEditDivision}>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDivisionKey(null)}
                      />
                      <Btn
                        title="Save"
                        disabled={
                          !editingDivisionFormName.trim() ||
                          (editingDivisionFormName.trim() === division.name &&
                            editingDivisionFormHead === (division.headEmail ?? ""))
                        }
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "universities" && (
            <>
          <SectionTitle>Universities · {selectedYear}</SectionTitle>
          <CardGrid>
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
                    <Row spread loading={savingEditUniversity}>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingUniversityKey(null)}
                      />
                      <Btn
                        title="Save"
                        disabled={
                          !editingUniversityFormName.trim() ||
                          editingUniversityFormName.trim() === university
                        }
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "departments" && (
            <>
          <SectionTitle>Departments · {selectedYear}</SectionTitle>
          <CardGrid>
          {editable && (
            <Card>
              <Field
                label="New department name"
                value={departmentName}
                onChangeText={setDepartmentName}
              />
              <Select
                label="Division"
                value={selectedDepartmentDivision}
                options={divisionNames}
                onSelect={setDepartmentDivision}
                placeholder="Choose a division…"
              />
              <Select
                label="Head of Department"
                value={departmentHead}
                options={[{ label: "— No head —", value: "" }, ...personOptions]}
                onSelect={setDepartmentHead}
                placeholder="Choose a person…"
              />
              <Btn
                title="Add Department"
                disabled={!departmentName.trim() || !selectedDepartmentDivision}
                onPress={() =>
                  void run(() =>
                    upsertDepartment({
                      year: selectedYear,
                      name: departmentName,
                      division: selectedDepartmentDivision,
                      headEmail: departmentHead || undefined,
                    })
                  ).then((ok) => ok && setDepartmentName(""))
                }
              />
            </Card>
          )}
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
                      options={divisionNames}
                      onSelect={setEditingDepartmentFormDivision}
                      placeholder="Choose a division…"
                    />
                    <Select
                      label="Head of Department"
                      value={editingDepartmentFormHead}
                      options={[{ label: "— No head —", value: "" }, ...personOptions]}
                      onSelect={setEditingDepartmentFormHead}
                      placeholder="Choose a person…"
                    />
                    <Row spread loading={savingEditDepartment}>
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDepartmentKey(null)}
                      />
                      <Btn
                        title="Save"
                        disabled={
                          !editingDepartmentFormName.trim() ||
                          !editingDepartmentFormDivision ||
                          (editingDepartmentFormName.trim() === department.name &&
                            editingDepartmentFormDivision === department.division &&
                            editingDepartmentFormHead === (department.headEmail ?? ""))
                        }
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
          </CardGrid>
            </>
          )}
        </>
      )}

      {key === "other" && (
        <CardGrid>
          <View style={{ gap: spacing.md }}>
          <SectionTitle>Budget Manager · {selectedYear}</SectionTitle>
          <Card>
            {editable ? (
              <>
                <Select
                  label="Budget Manager"
                  value={budgetManagerValue}
                  options={(financeMembers ?? []).map((person) => ({
                    label: person.name ?? person.email,
                    value: person.email,
                  }))}
                  onSelect={setBudgetManagerEmail}
                  placeholder="Choose a Finance member…"
                />
                <Btn
                  title="Set Budget Manager"
                  disabled={
                    !budgetManagerValue ||
                    budgetManagerValue === (structure?.budgetManagerEmail ?? "")
                  }
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
                label="Budget Manager"
                value={structure?.budgetManagerEmail ?? ""}
                options={(financeMembers ?? []).map((person) => ({
                  label: person.name ?? person.email,
                  value: person.email,
                }))}
                onSelect={() => {}}
                disabled
                placeholder="Not set"
              />
            )}
          </Card>
          </View>

          <View style={{ gap: spacing.md }}>
          <SectionTitle>Director Approval Threshold · {selectedYear}</SectionTitle>
          <Card>
            <Muted>
              Requests at or above this amount also need the Director&apos;s
              approval.
              {configuredThreshold == null
                ? ` Using the standard default of $${formatAmount(DIRECTOR_APPROVAL_THRESHOLD)}.`
                : ""}{" "}
              Only affects requests submitted from now on.
            </Muted>
            {editable ? (
              <>
                <Field
                  label="Threshold ($)"
                  value={thresholdValue}
                  onChangeText={(text) => setThresholdInput(currencyText(text))}
                  keyboardType="decimal-pad"
                />
                <Btn
                  title="Set Threshold"
                  disabled={!(thresholdNumber > 0) || thresholdUnchanged}
                  onPress={() =>
                    void run(() =>
                      setDirectorThreshold({
                        year: selectedYear,
                        amount: thresholdNumber,
                      })
                    ).then((ok) => ok && setThresholdInput(null))
                  }
                />
              </>
            ) : (
              <Muted>
                Threshold: $
                {(
                  configuredThreshold ?? DIRECTOR_APPROVAL_THRESHOLD
                ).toLocaleString()}
              </Muted>
            )}
          </Card>
          </View>

          {hasAccess && (
            <View style={{ gap: spacing.md }}>
              <SectionTitle>Approver Delegation · {selectedYear}</SectionTitle>
              <Card>
                <Muted>
                  Cover an approver while they&apos;re away: their delegate can
                  approve, decline and pay everything the approver could, for
                  this staff year. Remove it when they&apos;re back.
                </Muted>
                {(delegations ?? []).length === 0 ? (
                  <Muted>No delegations set.</Muted>
                ) : (
                  (delegations ?? []).map((d) => (
                    <Row key={d.id}>
                      <Txt style={{ flexGrow: 1 }}>
                        {(nameByEmail.get(d.fromEmail) ?? d.fromEmail) +
                          "  →  " +
                          (nameByEmail.get(d.toEmail) ?? d.toEmail)}
                      </Txt>
                      {editable && (
                        <IconButton
                          name="close"
                          size={32}
                          color={t.danger}
                          accessibilityLabel="Remove delegation"
                          onPress={() => setRemoveDelegationTarget(d)}
                        />
                      )}
                    </Row>
                  ))
                )}
                {editable && (
                  <>
                    <Select
                      label="Approver (being covered)"
                      value={delegationFrom}
                      options={personOptions}
                      onSelect={setDelegationFrom}
                      placeholder="Choose the approver…"
                    />
                    <Select
                      label="Delegate (acting on their behalf)"
                      value={delegationTo}
                      options={personOptions}
                      onSelect={setDelegationTo}
                      placeholder="Choose the stand-in…"
                    />
                    <Btn
                      title="Add Delegation"
                      disabled={
                        !delegationFrom ||
                        !delegationTo ||
                        delegationFrom === delegationTo
                      }
                      onPress={() =>
                        void run(() =>
                          addDelegation({
                            year: selectedYear,
                            fromEmail: delegationFrom,
                            toEmail: delegationTo,
                          })
                        ).then((ok) => {
                          if (ok) {
                            setDelegationFrom("");
                            setDelegationTo("");
                          }
                        })
                      }
                    />
                  </>
                )}
              </Card>
            </View>
          )}

          {isAdmin && (
            <View style={{ gap: spacing.md }}>
              <SectionTitle>Directory Sync</SectionTitle>
              <Card>
                <Muted>
                  Syncs all active Google Workspace users on sow.org.au into the
                  people picker, and caches staff profile photos for the org
                  chart. Runs automatically once a week.
                </Muted>
                {syncState?.syncedAt ? (
                  <Muted>
                    Last synced:{" "}
                    {new Date(syncState.syncedAt).toLocaleString()} ·{" "}
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
            </View>
          )}
        </CardGrid>
      )}
    </>
  );

  const adminTabs: PagerTab[] = budgetManagerOnly
    ? [{ key: "other", label: "Other", render: () => renderTabContent("other") }]
    : ADMIN_TABS.map((tabDef) => ({
        key: tabDef.key,
        label: tabDef.label,
        render: () => renderTabContent(tabDef.key as AdminTab),
      }));

  return (
    <>
      <PagerScreen
        fullWidth
        tabs={adminTabs}
        activeKey={activeTab}
        onActiveKeyChange={(key) => {
          setTab(key as AdminTab);
          setError(null);
        }}
        floating={
          budgetManagerOnly ? undefined : (
            <FloatingYearPicker
              year={selectedYear}
              years={years ?? [currentYear, currentYear + 1]}
              onSelect={onSelectYear}
              formatLabel={yearLabel}
            />
          )
        }
      />
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
        message={`Their ${selectedYear} roles and assignments will be deleted and they'll move to "Not serving".`}
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
        visible={removeDelegationTarget !== null}
        title="Remove delegation?"
        message={
          removeDelegationTarget
            ? `${nameByEmail.get(removeDelegationTarget.fromEmail) ?? removeDelegationTarget.fromEmail} → ${nameByEmail.get(removeDelegationTarget.toEmail) ?? removeDelegationTarget.toEmail}: the delegate can no longer act for the approver in ${selectedYear}.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeDelegationTarget) {
            void run(() => removeDelegation({ id: removeDelegationTarget.id }));
          }
        }}
        onClose={() => setRemoveDelegationTarget(null)}
      />
      <ConfirmDialog
        visible={syncConfirm}
        title="Sync directory now?"
        message="Pulls active Google Workspace users into the people picker and caches profile photos. Runs automatically each week."
        destructive={false}
        confirmLabel="Sync"
        onConfirm={() => {
          setSyncing(true);
          void run(() => requestSync({})).finally(() => setSyncing(false));
        }}
        onClose={() => setSyncConfirm(false)}
      />
      <Toast toast={toast} />
    </>
  );
}
