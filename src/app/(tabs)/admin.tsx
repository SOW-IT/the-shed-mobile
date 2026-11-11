import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { SignInPrompt } from "@/components/SignInPrompt";
import { AdminsCard } from "@/components/admin/AdminsCard";
import { AppErrorsCard } from "@/components/admin/AppErrorsCard";
import {
  CardGrid,
  type DeleteConfirm,
  MetaItem,
  StructureEditor,
  useStructureDraft,
} from "@/components/admin/StructureEditor";
import { TeamJobsCard } from "@/components/admin/TeamJobsCard";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  FloatingYearPicker,
  IconButton,
  InfoBanner,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Select,
  Toast,
  type ToastState,
  Txt,
} from "@/components/ui";
import { useAdminMutations } from "@/hooks/useAdminMutations";
import { useGroupedProfiles } from "@/hooks/useGroupedProfiles";
import { sydneyDateTime } from "@/lib/sydneyTime";
import {
  radius,
  spacing,
  typography,
  useAppTheme,
} from "@/theme";
import { api } from "@convex/_generated/api";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  type Assignment,
  DIRECTOR,
  formatAssignment,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  isChaplainRole,
  isSystemRole,
  MEMBER,
  roleNeedsDepartment,
  roleNeedsUniversity,
  ROLES,
  scopeKindFor,
  universityColour,
} from "@shared/flow";
import { canonicalEmailKey, uniqueStaffByEmail } from "@shared/rollcallImport";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const VISIBLE_USERS = 4;

type AdminTab = "users" | "structure" | "teams" | "system";
const ADMIN_TABS = [
  { key: "users", label: "Users" },
  { key: "structure", label: "Structure" },
  { key: "teams", label: "Teams" },
  { key: "system", label: "System" },
];

type StructureSubTab = "roles" | "divisions" | "departments" | "universities";
const STRUCTURE_SUB_TABS = [
  { key: "roles", label: "Roles" },
  { key: "divisions", label: "Divisions" },
  { key: "departments", label: "Departments" },
  { key: "universities", label: "Universities" },
];

const STAFF_EDITABLE_ROLES = ROLES.filter(
  (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER,
);

type AssignmentDraft = { role: string; department: string; university: string };
const emptyDraft = (role = STAFF_EDITABLE_ROLES[0]): AssignmentDraft => ({
  role,
  department: "",
  university: "",
});

const dropsARoleWithoutReplacing = (
  savedRoles: string[],
  nextRoles: string[],
): boolean =>
  nextRoles.every((role) => savedRoles.includes(role)) &&
  savedRoles.some((role) => !nextRoles.includes(role));

const sameAssignments = (a: AssignmentDraft[], b: AssignmentDraft[]): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.role === b[i].role &&
      x.department === b[i].department &&
      x.university === b[i].university,
  );

const AssignmentEditor = ({
  assignments,
  onChange,
  departments,
  universities,
  roles = STAFF_EDITABLE_ROLES,
  startIndex = 0,
  minCount = 1,
  canRemove = () => true,
}: {
  assignments: AssignmentDraft[];
  onChange: (a: AssignmentDraft[]) => void;
  departments: string[];
  universities: string[];
  roles?: string[];
  startIndex?: number;
  minCount?: number;
  canRemove?: (remaining: AssignmentDraft[]) => boolean;
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
            <View
              style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Select
                  label={
                    totalCount > 1 ? `Assignment ${startIndex + i + 1}` : "Role"
                  }
                  value={a.role}
                  options={rowRoles}
                  onSelect={(role) =>
                    update({ role, department: "", university: "" })
                  }
                />
              </View>
              {assignments.length > minCount &&
                canRemove(assignments.filter((_, j) => j !== i)) && (
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
        title="+ Add assignment"
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
    kind === "division"
      ? "Division"
      : kind === "university"
        ? "University"
        : kind === "department"
          ? "Department"
          : null;
  const scopeValue =
    kind === "division"
      ? (a.division ?? null)
      : kind === "university"
        ? (a.university ?? null)
        : kind === "department"
          ? (a.department ?? null)
          : null;
  return (
    <View
      style={{
        backgroundColor: t.ghost,
        borderRadius: radius.md,
        padding: 12,
        gap: 8,
        opacity: 0.6,
      }}
    >
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
            <Text style={[typography.body, { color: t.text, flex: 1 }]}>
              {a.role}
            </Text>
          </View>
        </View>
        <Ionicons
          name="lock-closed-outline"
          size={20}
          color={t.muted}
          style={{ marginBottom: 12 }}
          accessibilityLabel="Locked – managed in Structure tab"
        />
      </View>
      {scopeLabel && scopeValue && (
        <View style={{ gap: 6 }}>
          <Text style={[typography.label, { color: t.muted }]}>
            {scopeLabel}
          </Text>
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
            <Text style={[typography.body, { color: t.text }]}>
              {scopeValue}
            </Text>
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
  const hasAccess = isAdmin;
  const years = useQuery(api.directory.availableYears, isAdmin ? {} : "skip");
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? currentYear;
  const editable =
    selectedYear === currentYear || selectedYear === currentYear + 1;
  const [tab, setTab] = useState<AdminTab>("users");
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (
      tabParam === "users" ||
      tabParam === "structure" ||
      tabParam === "teams" ||
      tabParam === "system"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link tab param
      setTab(tabParam);
    }
  }, [tabParam]);
  const activeTab: AdminTab = tab;
  const [structureSubTab, setStructureSubTab] =
    useState<StructureSubTab>("roles");

  const structure = useQuery(
    api.directory.yearStructure,
    hasAccess ? { year: selectedYear } : "skip",
  );
  const profiles = useQuery(
    api.admin.listStaffProfiles,
    me?.isAdmin ? { year: selectedYear } : "skip",
  );
  const unassigned = useQuery(
    api.admin.listUnassignedUsers,
    me?.isAdmin && editable ? { year: selectedYear } : "skip",
  );
  const leavers = useQuery(
    api.admin.listLeavers,
    me?.isAdmin && editable ? { year: selectedYear } : "skip",
  );
  const people = useQuery(
    api.admin.people,
    hasAccess ? { year: selectedYear } : "skip",
  );
  const lockedNames = useQuery(api.admin.lockedNames, hasAccess ? {} : "skip");
  const teamView = useQuery(
    api.teams.view,
    hasAccess ? { year: selectedYear } : "skip",
  );
  const jobsOf = (department: string) =>
    (teamView?.jobs ?? [])
      .filter((job) => job.department === department)
      .map((job) => job.title);
  const lockedDepartments = new Set(lockedNames?.departments ?? []);
  const lockedDivisions = new Set(lockedNames?.divisions ?? []);
  const holdersLoaded = profiles != null;
  const holdersOf = (holds: (a: Assignment) => boolean) =>
    (profiles ?? []).filter((p) => p.assignments.some(holds)).length;
  const personOptions = (people ?? []).map((person) => ({
    label: person.name ?? person.email,
    value: person.email,
  }));
  const nameByEmail = new Map((people ?? []).map((p) => [p.email, p.name]));
  const unassignedEmails = new Set((unassigned ?? []).map((u) => u.email));

  const [onlyNotSignedIn, setOnlyNotSignedIn] = useState(false);
  const notSignedInCount = (profiles ?? []).filter((p) => !p.signedIn).length;
  const showingNotSignedIn = onlyNotSignedIn;
  const {
    director,
    groupedProfiles,
    campusByUniversity,
    nonCampusOtherProfiles,
  } = useGroupedProfiles(
    structure,
    showingNotSignedIn ? profiles?.filter((p) => !p.signedIn) : profiles,
  );

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
  } = useAdminMutations();
  const requestSync = useMutation(api.directorySync.requestSync);
  const syncState = useQuery(
    api.directorySync.list,
    me?.isAdmin ? { year: selectedYear } : "skip",
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

  const roleDraft = useStructureDraft();
  const divisionDraft = useStructureDraft();
  const universityDraft = useStructureDraft();
  const departmentDraft = useStructureDraft();

  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editingAssignments, setEditingAssignments] = useState<
    AssignmentDraft[]
  >([emptyDraft()]);
  const [savingEditUser, setSavingEditUser] = useState(false);
  const [assigningUserEmail, setAssigningUserEmail] = useState<string | null>(
    null,
  );
  const [assigningAssignments, setAssigningAssignments] = useState<
    AssignmentDraft[]
  >([emptyDraft()]);
  const [savingAssign, setSavingAssign] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(
    null,
  );
  const [removeProfileTarget, setRemoveProfileTarget] = useState<
    NonNullable<typeof profiles>[number] | null
  >(null);

  const startEditUser = (email: string) => {
    const existing = (profiles ?? []).find((p) => p.email === email);
    const all = existing?.assignments ?? [];
    const nonHead = all.filter(
      (a) => a.role !== HEAD_OF_DEPARTMENT && a.role !== HEAD_OF_DIVISION,
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
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (!hasAccess) {
    return (
      <Screen title="Admin">
        {me === null ? (
          <SignInPrompt what="page" />
        ) : (
          <EmptyState
            icon="lock-closed-outline"
            title="Only admins can open Admin"
          />
        )}
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
    (r) => r !== HEAD_OF_DEPARTMENT && r !== HEAD_OF_DIVISION && r !== MEMBER,
  );
  const assignableRoles =
    yearAssignableRoles.length > 0 ? yearAssignableRoles : STAFF_EDITABLE_ROLES;
  const directorExists = (profiles ?? []).some((p) =>
    p.assignments.some((a) => a.role === DIRECTOR),
  );
  const availableRoles = directorExists
    ? assignableRoles.filter((r) => r !== DIRECTOR)
    : assignableRoles;

  const divisionNames = (structure?.divisions ?? []).map((d) => d.name);
  const departmentsOf = (division: string) =>
    new Set(
      (structure?.departments ?? [])
        .filter((d) => d.division === division)
        .map((d) => d.name),
    );
  const structureProps = {
    year: selectedYear,
    editable,
    holdersLoaded,
    run,
    confirmDelete: setDeleteConfirm,
  };

  const leaverEmails = new Set((leavers ?? []).map((u) => u.email));
  const directoryOnlyUnassigned = (syncState?.users ?? []).filter(
    (u) =>
      !u.hasProfile &&
      !unassignedEmails.has(u.email) &&
      !leaverEmails.has(u.email),
  );
  const returningByEmail = new Map<
    string,
    { email: string; name?: string | null; previousYear?: number | null }
  >();
  for (const user of unassigned ?? []) {
    if (user.previousYear != null) {
      returningByEmail.set(canonicalEmailKey(user.email) ?? user.email, user);
    }
  }
  for (const user of directoryOnlyUnassigned) {
    const key = canonicalEmailKey(user.email) ?? user.email;
    if (user.previousYear != null && !returningByEmail.has(key)) {
      returningByEmail.set(key, user);
    }
  }
  const signedInNeverStaff = uniqueStaffByEmail(
    (unassigned ?? []).filter((u) => u.previousYear == null),
  );
  const directoryNeverStaff = uniqueStaffByEmail(
    directoryOnlyUnassigned.filter((u) => u.previousYear == null),
  );
  const returningStaff = uniqueStaffByEmail([...returningByEmail.values()]);

  const saveAssign = (email: string) => {
    if (
      directorExists &&
      assigningAssignments.some((a) => a.role === DIRECTOR)
    ) {
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
      }),
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
              <Btn title="Save" onPress={() => saveAssign(user.email)} />
            </Row>
          </>
        ) : (
          <View style={styles.cardRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
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
                  markLeaving({ email: user.email, year: selectedYear }),
                )
              }
            />
            <IconButton
              name="person-add-outline"
              size={40}
              accessibilityLabel="Assign"
              onPress={() => startAssign(user.email)}
            />
          </View>
        )}
      </Card>
    );
  };

  const renderLeaverCard = (user: { email: string; name?: string | null }) => (
    <Card key={user.email}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
          {user.name ? <Muted>{user.email}</Muted> : null}
        </View>
        <Btn
          title="Retain"
          variant="ghost"
          onPress={() =>
            void run(() =>
              unmarkLeaving({ email: user.email, year: selectedYear }),
            )
          }
        />
      </View>
    </Card>
  );

  const accentBorderWidth = 4;
  const cardHorizontalPadding = spacing.lg + 2;
  const accentContainerStyle = { gap: spacing.md };
  const accentCardStyle = (accentColour: string) => ({
    borderLeftWidth: accentBorderWidth,
    borderLeftColor: accentColour,
    paddingLeft: cardHorizontalPadding - accentBorderWidth,
  });

  const renderProfileCard = (
    profile: NonNullable<typeof profiles>[number],
    accentColour?: string | null,
  ) => {
    const isEditingThis = editingUserEmail === profile.email;
    const lockedHeadAssignments = profile.assignments.filter(
      (a) => a.role === HEAD_OF_DEPARTMENT || a.role === HEAD_OF_DIVISION,
    );
    const savedAssignments: AssignmentDraft[] = profile.assignments
      .filter(
        (a) => a.role !== HEAD_OF_DEPARTMENT && a.role !== HEAD_OF_DIVISION,
      )
      .map((a) => ({
        role: a.role,
        department: a.department ?? "",
        university: a.university ?? "",
      }));
    const assignmentsChanged = !sameAssignments(
      editingAssignments,
      savedAssignments,
    );
    const savedRoles = [
      ...new Set(profile.assignments.map((a) => a.role)),
    ];
    const canRemoveAssignment = (remaining: AssignmentDraft[]) =>
      lockedHeadAssignments.length > 0 ||
      !dropsARoleWithoutReplacing(
        savedRoles,
        remaining.map((a) => a.role),
      );
    return (
      <Card
        key={profile._id}
        style={accentColour ? accentCardStyle(accentColour) : undefined}
      >
        {isEditingThis ? (
          <>
            <Txt style={{ fontWeight: "600" }}>
              {profile.name ?? profile.email}
            </Txt>
            {profile.name ? <Muted>{profile.email}</Muted> : null}
            {lockedHeadAssignments.map((a, i) => (
              <LockedAssignmentRow
                key={i}
                a={a}
                index={i}
                totalCount={
                  lockedHeadAssignments.length + editingAssignments.length
                }
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
              canRemove={canRemoveAssignment}
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
                  const isCurrentDirector = profile.assignments.some(
                    (a) => a.role === DIRECTOR,
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
                    }),
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
            <View style={{ flexGrow: 1, flexShrink: 1 }}>
              <View style={styles.nameRow}>
                <Txt style={{ fontWeight: "600", flexShrink: 1 }}>
                  {profile.name ?? profile.email}
                </Txt>
                {profile.signedIn ? null : (
                  <View
                    accessibilityLabel="Hasn't signed in yet"
                    style={[
                      styles.notSignedInPill,
                      { backgroundColor: t.warningSoft },
                    ]}
                  >
                    <Text
                      style={[styles.notSignedInText, { color: t.warning }]}
                    >
                      Not signed in
                    </Text>
                  </View>
                )}
              </View>
              {profile.name ? <Muted>{profile.email}</Muted> : null}
              {profile.assignments.length > 0 ? (
                <View style={{ marginTop: 2 }}>
                  {profile.assignments.map((a, i) => (
                    <Muted key={i}>
                      {formatAssignment(a, structure?.roleTitles)}
                    </Muted>
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
    setEditingUserEmail(null);
    setAssigningUserEmail(null);
    roleDraft.setEditingKey(null);
    divisionDraft.setEditingKey(null);
    universityDraft.setEditingKey(null);
    departmentDraft.setEditingKey(null);
  };

  const renderTabContent = (key: AdminTab) => (
    <>
      <ErrorBanner message={error} />
      <InfoBanner
        message={
          selectedYear === currentYear + 1
            ? `You're editing ${selectedYear}, the next staff year, which starts on 1 October ${currentYear}.`
            : null
        }
      />

      {key === "users" && (
        <>
          {(notSignedInCount > 0 || showingNotSignedIn) && (
            <View style={styles.signedInSummary}>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: showingNotSignedIn }}
                accessibilityLabel={`Only staff who haven't signed in: ${notSignedInCount} of ${(profiles ?? []).length}`}
                onPress={() => setOnlyNotSignedIn((on) => !on)}
                style={({ pressed }) => [
                  styles.filterChip,
                  {
                    borderColor: showingNotSignedIn ? t.primary : t.border,
                    backgroundColor: showingNotSignedIn
                      ? t.primary
                      : "transparent",
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons
                  name={showingNotSignedIn ? "checkmark" : "log-in-outline"}
                  size={15}
                  color={showingNotSignedIn ? t.onPrimary : t.muted}
                />
                <Txt
                  style={[
                    styles.filterChipText,
                    { color: showingNotSignedIn ? t.onPrimary : t.text },
                  ]}
                >
                  Not signed in
                </Txt>
                <Txt
                  style={[
                    styles.filterChipText,
                    { color: showingNotSignedIn ? t.onPrimary : t.muted },
                  ]}
                >
                  {notSignedInCount}
                </Txt>
              </Pressable>
            </View>
          )}

          {!showingNotSignedIn && editable && returningStaff.length > 0 && (
            <>
              <SectionTitle>
                Previously staff · {selectedYear} ({returningStaff.length})
              </SectionTitle>
              <CardGrid maxVisible={VISIBLE_USERS}>
                {returningStaff.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {!showingNotSignedIn && editable && signedInNeverStaff.length > 0 && (
            <>
              <SectionTitle>
                Signed in, no assignment · {selectedYear} (
                {signedInNeverStaff.length})
              </SectionTitle>
              <CardGrid maxVisible={VISIBLE_USERS}>
                {signedInNeverStaff.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {!showingNotSignedIn &&
            editable &&
            directoryNeverStaff.length > 0 && (
              <>
                <SectionTitle>
                  In directory, no assignment · {selectedYear} (
                  {directoryNeverStaff.length})
                </SectionTitle>
                <CardGrid maxVisible={VISIBLE_USERS}>
                  {directoryNeverStaff.map((user) =>
                    renderUnassignedCard(user),
                  )}
                </CardGrid>
              </>
            )}

          {!showingNotSignedIn && editable && (leavers ?? []).length > 0 && (
            <>
              <SectionTitle>
                Leaving · {selectedYear} ({(leavers ?? []).length})
              </SectionTitle>
              <CardGrid maxVisible={VISIBLE_USERS}>
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
                <SectionTitle>
                  {group.division} · {selectedYear}
                </SectionTitle>
                {group.head ? (
                  <CardGrid>
                    {renderProfileCard(group.head, t.primary)}
                  </CardGrid>
                ) : null}
                {group.departments.map((dept) => {
                  const deptAccent = dept.colour ?? t.primary;
                  return (
                    <View key={dept.name} style={accentContainerStyle}>
                      <Text
                        style={[
                          typography.label,
                          { color: t.muted, paddingTop: 4 },
                        ]}
                      >
                        {dept.name}
                      </Text>
                      <CardGrid>
                        {dept.head
                          ? renderProfileCard(dept.head, deptAccent)
                          : null}
                        {dept.profiles.map((profile) =>
                          renderProfileCard(profile, deptAccent),
                        )}
                      </CardGrid>
                    </View>
                  );
                })}
                {group.divisionOnlyProfiles.length > 0 && (
                  <CardGrid>
                    {group.divisionOnlyProfiles.map((profile) =>
                      renderProfileCard(profile, t.primary),
                    )}
                  </CardGrid>
                )}
              </View>
            );
          })}

          {campusByUniversity.map((group) => {
            const campusAccent =
              universityColour(group.university) ?? t.primary;
            return (
              <View key={group.university} style={accentContainerStyle}>
                <SectionTitle>
                  {group.university} · {selectedYear}
                </SectionTitle>
                <CardGrid>
                  {group.profiles.map((profile) =>
                    renderProfileCard(profile, campusAccent),
                  )}
                </CardGrid>
              </View>
            );
          })}

          {nonCampusOtherProfiles.length > 0 && (
            <>
              <SectionTitle>Other · {selectedYear}</SectionTitle>
              <CardGrid>
                {nonCampusOtherProfiles.map((profile) =>
                  renderProfileCard(profile),
                )}
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
            <StructureEditor
              {...structureProps}
              title="Roles"
              state={roleDraft}
              items={(structure?.roles ?? []).map((name) => ({ name }))}
              emptyText="No roles yet."
              addLabel="New role"
              addTitle="Add role"
              renameLabel="Role name (rename cascades to staff and scheduled announcements)"
              systemLocked={isSystemRole}
              holders={(role) => holdersOf((a) => a.role === role.name)}
              add={(form) => upsertRole({ year: selectedYear, name: form.name })}
              update={(role, form) =>
                updateRole({ year: selectedYear, oldName: role.name, newName: form.name })
              }
              remove={(role) => removeRole({ year: selectedYear, name: role.name })}
            />
          )}

          {structureSubTab === "divisions" && (
            <StructureEditor
              {...structureProps}
              title="Divisions"
              state={divisionDraft}
              items={structure?.divisions ?? []}
              addLabel="New division name"
              addTitle="Add division"
              renameLabel="Division name (rename cascades to departments, staff and scheduled announcements)"
              lockedNameLabel="Division name"
              nameLocked={(name) => lockedDivisions.has(name)}
              head={{
                addLabel: "Head of Division (a person can head several divisions)",
                editLabel: "Head of Division",
                options: personOptions,
              }}
              holders={(division) => {
                const departments = departmentsOf(division.name);
                return holdersOf(
                  (a) => a.division === division.name || departments.has(a.department ?? ""),
                );
              }}
              details={(division, holderCount) => (
                <>
                  {division.headEmail ? (
                    <MetaItem icon="person-outline">
                      {nameByEmail.get(division.headEmail) ?? division.headEmail}
                    </MetaItem>
                  ) : (
                    <Muted>No head assigned</Muted>
                  )}
                  {holderCount}
                </>
              )}
              deleteMessage={(division) =>
                departmentsOf(division.name).size > 0
                  ? "Its departments are removed with it."
                  : undefined
              }
              add={(form) =>
                upsertDivision({
                  year: selectedYear,
                  name: form.name,
                  headEmail: form.head || undefined,
                })
              }
              update={(division, form) =>
                updateDivision({
                  year: selectedYear,
                  oldName: division.name,
                  newName: form.name,
                  headEmail: form.head || undefined,
                })
              }
              remove={(division) => removeDivision({ year: selectedYear, name: division.name })}
            />
          )}

          {structureSubTab === "universities" && (
            <StructureEditor
              {...structureProps}
              title="Universities"
              state={universityDraft}
              items={(structure?.universities ?? []).map((name) => ({ name }))}
              emptyText="No universities yet."
              addLabel="New university"
              addTitle="Add university"
              renameLabel="University name (rename cascades to staff and scheduled announcements)"
              holders={(university) => holdersOf((a) => a.university === university.name)}
              add={(form) => upsertUniversity({ year: selectedYear, name: form.name })}
              update={(university, form) =>
                updateUniversity({
                  year: selectedYear,
                  oldName: university.name,
                  newName: form.name,
                })
              }
              remove={(university) =>
                removeUniversity({ year: selectedYear, name: university.name })
              }
            />
          )}

          {structureSubTab === "departments" && (
            <StructureEditor
              {...structureProps}
              title="Departments"
              state={departmentDraft}
              items={structure?.departments ?? []}
              addLabel="New department name"
              addTitle="Add department"
              renameLabel="Department name (rename cascades to staff, all requests and scheduled announcements)"
              lockedNameLabel="Department name"
              nameLocked={(name) => lockedDepartments.has(name)}
              divisions={divisionNames}
              head={{
                addLabel: "Head of Department",
                editLabel: "Head of Department",
                options: personOptions,
              }}
              holders={(department) => holdersOf((a) => a.department === department.name)}
              jobs={(department) => jobsOf(department.name)}
              details={(department, holderCount) => {
                const departmentJobs = jobsOf(department.name);
                return (
                  <View style={styles.departmentMeta}>
                    <MetaItem icon="git-branch-outline" flush>
                      {department.division}
                    </MetaItem>
                    {department.headEmail && (
                      <MetaItem icon="person-outline" flush>
                        {nameByEmail.get(department.headEmail) ?? department.headEmail}
                      </MetaItem>
                    )}
                    {holderCount}
                    {departmentJobs.length > 0 ? (
                      <MetaItem icon="briefcase-outline">{departmentJobs.join(", ")}</MetaItem>
                    ) : null}
                  </View>
                );
              }}
              editLabel={(department) => `Edit ${department.name}`}
              add={(form) =>
                upsertDepartment({
                  year: selectedYear,
                  name: form.name,
                  division: form.division,
                  headEmail: form.head || undefined,
                })
              }
              update={(department, form) =>
                updateDepartment({
                  year: selectedYear,
                  oldName: department.name,
                  newName: form.name,
                  division: form.division,
                  headEmail: form.head || undefined,
                })
              }
              remove={(department) =>
                removeDepartment({ year: selectedYear, name: department.name })
              }
            />
          )}
        </>
      )}

      {key === "teams" && (
        <CardGrid>
          <AdminsCard />
          <TeamJobsCard key={selectedYear} year={selectedYear} />
        </CardGrid>
      )}

      {key === "system" && (
        <CardGrid>
          <AppErrorsCard />
          <View style={{ gap: spacing.md }}>
            <SectionTitle>Directory sync</SectionTitle>
            <Card>
              {syncState?.syncedAt ? (
                <Muted>
                  Last synced: {sydneyDateTime(syncState.syncedAt)} ·{" "}
                  {syncState.status}
                </Muted>
              ) : (
                <Muted>Never synced.</Muted>
              )}
              <Btn
                title={syncing ? "Syncing…" : "Sync directory now"}
                loading={syncing}
                onPress={() => setSyncConfirm(true)}
              />
            </Card>
          </View>
        </CardGrid>
      )}
    </>
  );

  const adminTabs: PagerTab[] = ADMIN_TABS.map((tabDef) => ({
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
          <FloatingYearPicker
            year={selectedYear}
            years={years ?? [currentYear, currentYear + 1]}
            onSelect={onSelectYear}
            formatLabel={yearLabel}
          />
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
        message={`Their ${selectedYear} roles and assignments will be deleted and they'll move to "Leaving".`}
        requireText={removeProfileTarget?.name ?? removeProfileTarget?.email}
        onConfirm={() => {
          if (removeProfileTarget) {
            void run(() =>
              removeStaffProfile({
                email: removeProfileTarget.email,
                year: selectedYear,
              }),
            );
          }
        }}
        onClose={() => setRemoveProfileTarget(null)}
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

const styles = StyleSheet.create({
  cardRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 13.5, fontWeight: "600" },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  notSignedInPill: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  notSignedInText: {
    fontSize: 11,
    fontWeight: "700",
  },
  departmentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
    flexWrap: "wrap",
  },
  signedInSummary: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
});
