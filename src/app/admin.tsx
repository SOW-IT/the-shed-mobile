import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  acronym,
  HEAD_OF_DIVISION,
  ROLES,
  roleNeedsDepartment,
  rolesNeedUniversity,
} from "../../shared/flow";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "@/theme";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  Field,
  MultiSelect,
  Muted,
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

// Alert.alert buttons are a no-op on react-native-web, so the web build
// falls back to window.confirm.
const confirmRemoval = (message: string, onConfirm: () => void) => {
  if (Platform.OS === "web") {
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert("Remove member", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: onConfirm },
  ]);
};

type AdminTab = "users" | "structure" | "other";
const ADMIN_TABS = [
  { key: "users", label: "Users" },
  { key: "structure", label: "Structure" },
  { key: "other", label: "Other" },
];

export default function AdminScreen() {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const years = useQuery(api.directory.availableYears, me?.isAdmin ? {} : "skip");
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? currentYear;
  const editable = selectedYear === currentYear || selectedYear === currentYear + 1;
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [tab, setTab] = useState<AdminTab>("users");
  const scrollRef = useRef<ScrollView>(null);

  const structure = useQuery(
    api.directory.yearStructure,
    me?.isAdmin ? { year: selectedYear } : "skip"
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

  const setStaffProfile = useMutation(api.admin.setStaffProfile);
  const removeStaffProfile = useMutation(api.admin.removeStaffProfile);
  const upsertDivision = useMutation(api.admin.upsertDivision);
  const updateDivision = useMutation(api.admin.updateDivision);
  const upsertDepartment = useMutation(api.admin.upsertDepartment);
  const updateDepartment = useMutation(api.admin.updateDepartment);
  const upsertUniversity = useMutation(api.admin.upsertUniversity);
  const setBudgetManager = useMutation(api.admin.setBudgetManager);

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

  // Staff add form — for new assignments.
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRoles, setStaffRoles] = useState<string[]>([ROLES[0]]);
  const [staffDepartment, setStaffDepartment] = useState("");
  const [staffDivision, setStaffDivision] = useState("");
  const [staffUniversity, setStaffUniversity] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  // Picking a person pre-fills the add form with their existing assignment.
  const selectPerson = (email: string) => {
    setStaffEmail(email);
    const existing = (profiles ?? []).find((p) => p.email === email);
    setStaffRoles(existing && existing.roles.length > 0 ? existing.roles : [ROLES[0]]);
    setStaffDepartment(existing?.department ?? "");
    setStaffDivision(existing?.division ?? "");
    setStaffUniversity(existing?.university ?? "");
  };
  // Division / department / university add forms
  const [divisionName, setDivisionName] = useState("");
  const [divisionHead, setDivisionHead] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentDivision, setDepartmentDivision] = useState("");
  const [departmentHead, setDepartmentHead] = useState("");
  // Budget manager form — null means "untouched", showing the current one.
  const [budgetManagerEmail, setBudgetManagerEmail] = useState<string | null>(null);
  const budgetManagerValue =
    budgetManagerEmail ?? structure?.budgetManagerEmail ?? "";

  // Inline editing state for user cards
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editingUserRoles, setEditingUserRoles] = useState<string[]>([ROLES[0]]);
  const [editingUserDepartment, setEditingUserDepartment] = useState("");
  const [editingUserDivision, setEditingUserDivision] = useState("");
  const [editingUserUniversity, setEditingUserUniversity] = useState("");
  const [savingEditUser, setSavingEditUser] = useState(false);
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

  const startEditUser = (email: string) => {
    const existing = (profiles ?? []).find((p) => p.email === email);
    setEditingUserRoles(
      existing && existing.roles.length > 0 ? existing.roles : [ROLES[0]]
    );
    setEditingUserDepartment(existing?.department ?? "");
    setEditingUserDivision(existing?.division ?? "");
    setEditingUserUniversity(existing?.university ?? "");
    setEditingUserEmail(email);
  };

  if (me && !me.isAdmin) {
    return (
      <Screen>
        <Muted>Only admins can access this screen.</Muted>
      </Screen>
    );
  }

  const needsDivision = staffRoles.includes(HEAD_OF_DIVISION);
  const needsUniversity = rolesNeedUniversity(staffRoles);
  const needsDepartment = staffRoles.some(roleNeedsDepartment);
  const yearLabel = (y: number) =>
    y === currentYear
      ? `${y} (current)`
      : y === currentYear + 1
        ? `${y} (from Sep 1)`
        : `${y}`;

  return (
    <Screen toast={toast} scrollRef={scrollRef}>
      <Row>
        <View style={{ flexGrow: 1 }}>
          <SectionTitle>Manage — {yearLabel(selectedYear)}</SectionTitle>
        </View>
        <Pressable
          style={[styles.yearButton, { backgroundColor: t.card, borderColor: t.border }]}
          onPress={() => setYearMenuOpen(true)}
        >
          <Txt style={{ fontWeight: "700" }}>{selectedYear} ▾</Txt>
        </Pressable>
      </Row>
      <Modal visible={yearMenuOpen} transparent animationType="fade">
        <Pressable style={styles.yearBackdrop} onPress={() => setYearMenuOpen(false)}>
          <View style={[styles.yearMenu, { backgroundColor: t.card }]}>
            <ScrollView>
              {(years ?? [currentYear, currentYear + 1]).map((y) => (
                <Pressable
                  key={y}
                  style={[styles.yearItem, y === selectedYear && { backgroundColor: t.ghost }]}
                  onPress={() => {
                    setYear(y);
                    setYearMenuOpen(false);
                  }}
                >
                  <Txt style={y === selectedYear ? { fontWeight: "700" } : undefined}>
                    {yearLabel(y)}
                  </Txt>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Segmented
        segments={ADMIN_TABS}
        active={tab}
        onChange={(key) => setTab(key as AdminTab)}
      />

      {!editable && (
        <Card>
          <Muted>
            {selectedYear} is a past year — view only. You can edit {currentYear} and{" "}
            {currentYear + 1}.
          </Muted>
        </Card>
      )}
      <ErrorBanner message={error} />

      {tab === "users" && (
        <>
          {editable && (unassigned ?? []).length > 0 && (
            <>
              <SectionTitle>Signed in, no assignment — {selectedYear}</SectionTitle>
              {(unassigned ?? []).map((user) => (
                <Card key={user.email}>
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{user.name ?? user.email}</Txt>
                      <Muted>{user.email}</Muted>
                    </View>
                    <Btn
                      title="Assign"
                      variant="ghost"
                      onPress={() => selectPerson(user.email)}
                    />
                  </Row>
                </Card>
              ))}
            </>
          )}

          <SectionTitle>Staff — {selectedYear}</SectionTitle>
          {editable && (
            <Card>
              {personOptions.length > 0 && (
                <Select
                  label="Person (selecting pre-fills the form with their current assignment)"
                  value={staffEmail}
                  options={personOptions}
                  onSelect={selectPerson}
                  placeholder="Choose a person…"
                />
              )}
              <Field
                label="Or type a new email (they don't need to have signed in yet)"
                value={staffEmail}
                onChangeText={setStaffEmail}
                placeholder="someone@sow.org.au"
                keyboardType="email-address"
              />
              <MultiSelect
                label="Role (select one or more)"
                values={staffRoles}
                options={ROLES}
                onSelect={setStaffRoles}
              />
              {needsDivision && (
                <Select
                  label="Division (Heads of Division belong directly to one)"
                  value={staffDivision}
                  options={(structure?.divisions ?? []).map((d) => d.name)}
                  onSelect={setStaffDivision}
                  placeholder="Choose a division…"
                />
              )}
              {needsUniversity && (
                <Select
                  label="University (Student Leaders belong to one, not a department)"
                  value={staffUniversity}
                  options={structure?.universities ?? []}
                  onSelect={setStaffUniversity}
                  placeholder="Choose a university…"
                />
              )}
              {needsDepartment && (
                <Select
                  label="Department"
                  value={staffDepartment}
                  options={(structure?.departments ?? []).map((d) => d.name)}
                  onSelect={setStaffDepartment}
                  placeholder="Choose a department…"
                />
              )}
              <Btn
                title="Save Staff Assignment"
                loading={savingStaff}
                onPress={() => {
                  const email = staffEmail.trim().toLowerCase();
                  setSavingStaff(true);
                  void run(() =>
                    setStaffProfile({
                      email,
                      year: selectedYear,
                      roles: staffRoles,
                      department: needsDepartment ? staffDepartment : undefined,
                      division: needsDivision ? staffDivision : undefined,
                      university: needsUniversity ? staffUniversity : undefined,
                    })
                  )
                    .then((ok) => {
                      if (ok) {
                        setToast({ text: `Saved ${email} for ${selectedYear}` });
                        setStaffEmail("");
                      }
                    })
                    .finally(() => setSavingStaff(false));
                }}
              />
            </Card>
          )}
          {(profiles ?? []).map((profile) => {
            const isEditingThis = editingUserEmail === profile.email;
            const needsEditDiv = editingUserRoles.includes(HEAD_OF_DIVISION);
            const needsEditUni = rolesNeedUniversity(editingUserRoles);
            const needsEditDept = editingUserRoles.some(roleNeedsDepartment);
            return (
              <Card key={profile._id}>
                {isEditingThis ? (
                  <>
                    <Txt style={{ fontWeight: "600" }}>{profile.name ?? profile.email}</Txt>
                    {profile.name ? <Muted>{profile.email}</Muted> : null}
                    <MultiSelect
                      label="Role (select one or more)"
                      values={editingUserRoles}
                      options={ROLES}
                      onSelect={setEditingUserRoles}
                    />
                    {needsEditDiv && (
                      <Select
                        label="Division"
                        value={editingUserDivision}
                        options={(structure?.divisions ?? []).map((d) => d.name)}
                        onSelect={setEditingUserDivision}
                        placeholder="Choose a division…"
                      />
                    )}
                    {needsEditUni && (
                      <Select
                        label="University"
                        value={editingUserUniversity}
                        options={structure?.universities ?? []}
                        onSelect={setEditingUserUniversity}
                        placeholder="Choose a university…"
                      />
                    )}
                    {needsEditDept && (
                      <Select
                        label="Department"
                        value={editingUserDepartment}
                        options={(structure?.departments ?? []).map((d) => d.name)}
                        onSelect={setEditingUserDepartment}
                        placeholder="Choose a department…"
                      />
                    )}
                    <Row>
                      <Btn
                        title="Save"
                        loading={savingEditUser}
                        onPress={() => {
                          setSavingEditUser(true);
                          void run(() =>
                            setStaffProfile({
                              email: profile.email,
                              year: selectedYear,
                              roles: editingUserRoles,
                              department: needsEditDept ? editingUserDepartment : undefined,
                              division: needsEditDiv ? editingUserDivision : undefined,
                              university: needsEditUni ? editingUserUniversity : undefined,
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
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingUserEmail(null)}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{profile.name ?? profile.email}</Txt>
                      {profile.name ? <Muted>{profile.email}</Muted> : null}
                      <Muted>
                        {profile.roles.map(acronym).join(", ")} •{" "}
                        {[profile.department, profile.division, profile.university]
                          .map((name) => name && acronym(name))
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </Muted>
                    </View>
                    {editable && (
                      <>
                        <Pressable
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.iconButton,
                            { backgroundColor: t.ghost },
                            pressed && { opacity: 0.6 },
                          ]}
                          onPress={() => startEditUser(profile.email)}
                        >
                          <Ionicons name="create-outline" size={18} color={t.ghostText} />
                        </Pressable>
                        <Pressable
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.iconButton,
                            { backgroundColor: t.ghost },
                            pressed && { opacity: 0.6 },
                          ]}
                          onPress={() =>
                            confirmRemoval(
                              `Remove ${profile.email} from ${selectedYear}? Their roles and department assignment for the year will be deleted.`,
                              () =>
                                void run(() =>
                                  removeStaffProfile({
                                    email: profile.email,
                                    year: selectedYear,
                                  })
                                )
                            )
                          }
                        >
                          <Ionicons name="trash-outline" size={18} color={t.danger} />
                        </Pressable>
                      </>
                    )}
                  </Row>
                )}
              </Card>
            );
          })}
        </>
      )}

      {tab === "structure" && (
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
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDivisionKey(null)}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{division.name}</Txt>
                      <Muted>Head: {division.headEmail ?? "none"}</Muted>
                    </View>
                    {editable && (
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.iconButton,
                          { backgroundColor: t.ghost },
                          pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => {
                          setEditingDivisionFormName(division.name);
                          setEditingDivisionFormHead(division.headEmail ?? "");
                          setEditingDivisionKey(division.name);
                        }}
                      >
                        <Ionicons name="create-outline" size={18} color={t.ghostText} />
                      </Pressable>
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

          <SectionTitle>Universities — {selectedYear}</SectionTitle>
          <Card>
            <Muted>{(structure?.universities ?? []).join(", ") || "None yet."}</Muted>
            {editable && (
              <>
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
              </>
            )}
          </Card>

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
                      <Btn
                        title="Cancel"
                        variant="ghost"
                        onPress={() => setEditingDepartmentKey(null)}
                      />
                    </Row>
                  </>
                ) : (
                  <Row>
                    <View style={{ flexGrow: 1 }}>
                      <Txt style={{ fontWeight: "600" }}>{department.name}</Txt>
                      <Muted>
                        Division: {department.division} • Head: {department.headEmail ?? "none"}
                      </Muted>
                    </View>
                    {editable && (
                      <Pressable
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.iconButton,
                          { backgroundColor: t.ghost },
                          pressed && { opacity: 0.6 },
                        ]}
                        onPress={() => {
                          setEditingDepartmentFormName(department.name);
                          setEditingDepartmentFormDivision(department.division);
                          setEditingDepartmentFormHead(department.headEmail ?? "");
                          setEditingDepartmentKey(department.name);
                        }}
                      >
                        <Ionicons name="create-outline" size={18} color={t.ghostText} />
                      </Pressable>
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

      {tab === "other" && (
        <>
          <SectionTitle>Budget Manager — {selectedYear}</SectionTitle>
          <Card>
            <Muted>
              Current: {structure?.budgetManagerEmail ?? "not set"} (must be from
              the Finance department)
            </Muted>
            {editable && (
              <>
                <Select
                  label="Budget Manager (Finance department members)"
                  value={budgetManagerValue}
                  options={(people ?? [])
                    .filter((person) => person.department === "Finance")
                    .map((person) => ({
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
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  yearButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  yearBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 32,
  },
  yearMenu: {
    borderRadius: 12,
    paddingVertical: 4,
    maxWidth: 360,
    // Many history years are available; keep the menu within small phone
    // screens and let it scroll instead.
    maxHeight: 320,
    width: "100%",
    alignSelf: "center",
  },
  yearItem: { paddingHorizontal: 16, paddingVertical: 12 },
  iconButton: { borderRadius: 8, padding: 8 },
});
