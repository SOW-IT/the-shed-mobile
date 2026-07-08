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

/**
 * Admin console: per-year staff roles/departments (including people who
 * haven't signed in yet, by email), divisions, departments and the Budget
 * Manager — split into Users / Structure / Other tabs. Admins can EDIT the
 * current year and the next one (next-year changes take effect at the
 * October 1 rollover) and VIEW any past year.
 */

type DeleteConfirm = { name: string; message: string; onConfirm: () => void };

/**
 * Card width for the wide-screen admin grids: every section lays its cards out
 * left-to-right at this width, fitting as many per row as the screen allows
 * (Grid fixed-width mode collapses to a single full-width column on phones).
 * Close to the phone reading width so the inline edit forms stay comfortable,
 * and sized so two columns fit an iPad-portrait / 768pt window
 * (2×360 + 12 gap ≤ 768 − 2×16 page padding) and three fit a desktop.
 */
const ADMIN_CARD_WIDTH = 360;

/** A section's cards, flowing left-to-right and wrapping (see ADMIN_CARD_WIDTH). */
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

/** True when two assignment-draft lists are identical (same rows, same order). */
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
  const [tab, setTab] = useState<AdminTab>("users");
  // Deep link (e.g. the Admin bar on the Org chart / Requests "All" tab) can
  // request a specific top-bar segment via ?tab=.
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
  const leavers = useQuery(
    api.admin.listLeavers,
    me?.isAdmin && editable ? { year: selectedYear } : "skip"
  );
  // People picker for the Approver Delegation selects — needed by the Finance
  // Head too now that they manage delegations, not just admins.
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

  // Bucket the year's profiles by division → department, then campus and other
  // (see useGroupedProfiles). Kept above the loading/access early-returns below
  // so the hook runs on every render, per the rules of hooks.
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
  // Director-threshold form — null means "untouched". The field shows the year's
  // configured value, or the standard default when none is set.
  const [thresholdInput, setThresholdInput] = useState<string | null>(null);
  const configuredThreshold = structure?.directorApprovalThreshold ?? null;
  const thresholdValue =
    thresholdInput ?? String(configuredThreshold ?? DIRECTOR_APPROVAL_THRESHOLD);
  const thresholdNumber = Number(thresholdValue);
  const thresholdUnchanged =
    thresholdNumber === configuredThreshold || thresholdValue.trim() === "";
  // Approver-delegation add form (the approver being covered → their stand-in).
  const [delegationFrom, setDelegationFrom] = useState("");
  const [delegationTo, setDelegationTo] = useState("");

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
  const [removeDelegationTarget, setRemoveDelegationTarget] = useState<
    NonNullable<typeof delegations>[number] | null
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
        ? `${y} (from Oct 1)`
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

  // The year's division names, for the department pickers. The add-department
  // form keeps its selected division across adds (handy for adding several to
  // one division), so reconcile it against the live list: if that division is
  // later deleted, the held value is treated as unselected rather than lingering
  // as a now-invalid selection that would be rejected on submit.
  const divisionNames = (structure?.divisions ?? []).map((d) => d.name);
  const selectedDepartmentDivision = divisionNames.includes(departmentDivision)
    ? departmentDivision
    : "";

  // Profiles grouped by division > department for the org-chart-style list.
  const leaverEmails = new Set((leavers ?? []).map((u) => u.email));
  const directoryOnlyUnassigned = (syncState?.users ?? []).filter(
    (u) => !u.hasProfile && !unassignedEmails.has(u.email) && !leaverEmails.has(u.email)
  );

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
      <Card key={user.email}>
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

  // A person parked in the "not serving" list — movable back to unassigned.
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
  // No coloured left-bar around the group itself — the cards inside already carry
  // the group's accent (like the Org Chart's department cards), so an outer bar
  // was a redundant second stripe. Just a plain vertical stack.
  const accentContainerStyle = (_accentColour: string) => ({
    gap: spacing.md,
  });
  const accentCardStyle = (accentColour: string) => ({
    borderLeftWidth: accentBorderWidth,
    borderLeftColor: accentColour,
    paddingLeft: cardHorizontalPadding - accentBorderWidth,
  });

  // Renders the collapsed or expanded card for an assigned profile.
  const renderProfileCard = (
    profile: NonNullable<typeof profiles>[number],
    accentColour?: string | null
  ) => {
    const isEditingThis = editingUserEmail === profile.email;
    const lockedHeadAssignments = (profile.assignments ?? []).filter(
      (a) => a.role === HEAD_OF_DEPARTMENT || a.role === HEAD_OF_DIVISION
    );
    // The saved (non-head) assignments the editor was seeded from. Save stays
    // disabled until the draft differs — adding, editing or removing a row.
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
              // A head role already covers the profile, so the last non-head
              // assignment can be removed too; otherwise keep at least one.
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

  // Switching the year also clears any in-progress inline edits and any
  // stale error banner from the previous year.
  const onSelectYear = (y: number) => {
    setYear(y);
    setError(null);
    // Clear every per-year draft so an unsaved value can't carry into — and be
    // submitted against — a different year (the Threshold field and the Budget
    // Manager picker both hold drafts keyed to the previously selected year).
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
          {editable && (unassigned ?? []).length > 0 && (
            <>
              <SectionTitle>Signed in, no assignment — {selectedYear}</SectionTitle>
              <CardGrid>
                {(unassigned ?? []).map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {editable && directoryOnlyUnassigned.length > 0 && (
            <>
              <SectionTitle>
                In directory, no assignment — {selectedYear} ({directoryOnlyUnassigned.length})
              </SectionTitle>
              <CardGrid>
                {directoryOnlyUnassigned.map((user) => renderUnassignedCard(user))}
              </CardGrid>
            </>
          )}

          {editable && (leavers ?? []).length > 0 && (
            <>
              <SectionTitle>
                Leaving — {selectedYear} ({(leavers ?? []).length})
              </SectionTitle>
              <CardGrid>
                {(leavers ?? []).map((user) => renderLeaverCard(user))}
              </CardGrid>
            </>
          )}

          {/* Director sits at the top, like the Org Chart. */}
          {director ? (
            <>
              <SectionTitle>Director — {selectedYear}</SectionTitle>
              <CardGrid>{renderProfileCard(director, t.primary)}</CardGrid>
            </>
          ) : null}

          {/* Profiles grouped by division > department */}
          {groupedProfiles.map((group) => {
            const hasAny =
              group.head ||
              group.departments.length > 0 ||
              group.divisionOnlyProfiles.length > 0;
            if (!hasAny) return null;
            return (
              <View key={group.division} style={{ gap: spacing.md }}>
                <SectionTitle>{group.division} — {selectedYear}</SectionTitle>
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

          {/* Campus roles grouped by university */}
          {campusByUniversity.map((group) => {
            const campusAccent = universityColour(group.university) ?? t.primary;
            return (
              <View
                key={group.university}
                style={accentContainerStyle(campusAccent)}
              >
                <SectionTitle>{group.university} — {selectedYear}</SectionTitle>
                <CardGrid>
                  {group.profiles.map((profile) =>
                    renderProfileCard(profile, campusAccent)
                  )}
                </CardGrid>
              </View>
            );
          })}

          {/* Profiles not in any division, department, or campus */}
          {nonCampusOtherProfiles.length > 0 && (
            <>
              <SectionTitle>Other — {selectedYear}</SectionTitle>
              <CardGrid>
                {nonCampusOtherProfiles.map((profile) => renderProfileCard(profile))}
              </CardGrid>
            </>
          )}
        </>
      )}

      {key === "structure" && (
        <>
          {/* The sub-tab bar keeps its reading-width cap even though the page
              content goes full width — a screen-wide pill switcher reads badly. */}
          <ReadableColumn>
            <Segmented
              segments={STRUCTURE_SUB_TABS}
              active={structureSubTab}
              onChange={(key) => setStructureSubTab(key as StructureSubTab)}
            />
          </ReadableColumn>

          {structureSubTab === "roles" && (
            <>
          <SectionTitle>Roles — {selectedYear}</SectionTitle>
          <CardGrid>
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
                        accessibilityLabel="Managed by the app — can't be renamed or deleted"
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "divisions" && (
            <>
          <SectionTitle>Divisions — {selectedYear}</SectionTitle>
          <CardGrid>
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "universities" && (
            <>
          <SectionTitle>Universities — {selectedYear}</SectionTitle>
          <CardGrid>
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
          </CardGrid>
            </>
          )}

          {structureSubTab === "departments" && (
            <>
          <SectionTitle>Departments — {selectedYear}</SectionTitle>
          <CardGrid>
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
          </CardGrid>
            </>
          )}
        </>
      )}

      {key === "other" && (
        // Each titled settings section is one grid cell, so the sections tile
        // side by side on wide screens instead of stacking down one column.
        <CardGrid>
          <View style={{ gap: spacing.md }}>
          <SectionTitle>Budget Manager — {selectedYear}</SectionTitle>
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
          <SectionTitle>Director Approval Threshold — {selectedYear}</SectionTitle>
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
              <SectionTitle>Approver Delegation — {selectedYear}</SectionTitle>
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
        // Wide screens tile each section's cards left-to-right (see CardGrid),
        // which needs the full width rather than the 720pt reading cap.
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
