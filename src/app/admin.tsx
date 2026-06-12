import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from "react-native";
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
  Muted,
  Row,
  Screen,
  SectionTitle,
  Select,
  type ToastState,
  Txt,
} from "@/components/ui";

/**
 * Admin console: per-year staff roles/departments (including people who
 * haven't signed in yet, by email), divisions, departments and the Budget
 * Manager. Admins can EDIT the current year and the next one (next-year
 * changes take effect at the September 1 rollover) and VIEW any past year.
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
export default function AdminScreen() {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const years = useQuery(api.directory.availableYears, me?.isAdmin ? {} : "skip");
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? currentYear;
  const editable = selectedYear === currentYear || selectedYear === currentYear + 1;
  const [yearMenuOpen, setYearMenuOpen] = useState(false);

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
  const upsertDepartment = useMutation(api.admin.upsertDepartment);
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

  // Staff form — a person can hold multiple roles, but most hold one, so the
  // picker stays single-select until "Allow multiple" is switched on.
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRoles, setStaffRoles] = useState<string[]>([ROLES[0]]);
  const [allowMultipleRoles, setAllowMultipleRoles] = useState(false);
  const [staffDepartment, setStaffDepartment] = useState("");
  const [staffDivision, setStaffDivision] = useState("");
  const [staffUniversity, setStaffUniversity] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const toggleRole = (role: string) =>
    setStaffRoles((previous) => {
      if (!allowMultipleRoles) return [role];
      return previous.includes(role)
        ? previous.filter((r) => r !== role)
        : [...previous, role];
    });
  const setAllowMultiple = (allow: boolean) => {
    setAllowMultipleRoles(allow);
    // Switching back to single-select keeps only the first chosen role.
    if (!allow) setStaffRoles((previous) => previous.slice(0, 1));
  };
  // Picking a person loads what they already have this year, so saving
  // edits their assignment instead of silently rebuilding it from scratch.
  const selectPerson = (email: string) => {
    setStaffEmail(email);
    const existing = (profiles ?? []).find((p) => p.email === email);
    const existingRoles =
      existing && existing.roles.length > 0 ? existing.roles : [ROLES[0]];
    setStaffRoles(existingRoles);
    setAllowMultipleRoles(existingRoles.length > 1);
    setStaffDepartment(existing?.department ?? "");
    setStaffDivision(existing?.division ?? "");
    setStaffUniversity(existing?.university ?? "");
  };
  // Division / department / university forms
  const [divisionName, setDivisionName] = useState("");
  const [divisionHead, setDivisionHead] = useState("");
  const [universityName, setUniversityName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [departmentDivision, setDepartmentDivision] = useState("");
  const [departmentHead, setDepartmentHead] = useState("");
  // Budget manager form
  const [budgetManagerEmail, setBudgetManagerEmail] = useState("");

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
    <Screen toast={toast}>
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
          </View>
        </Pressable>
      </Modal>
      {!editable && (
        <Card>
          <Muted>
            {selectedYear} is a past year — view only. You can edit {currentYear} and{" "}
            {currentYear + 1}.
          </Muted>
        </Card>
      )}
      <ErrorBanner message={error} />

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
              label="Person (selecting loads their current assignment)"
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
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Muted>
                {allowMultipleRoles
                  ? "Roles (tap to toggle — this person can hold several)"
                  : "Role (tap to pick one)"}
              </Muted>
            </View>
            <Btn
              title="Allow multiple"
              variant={allowMultipleRoles ? "primary" : "ghost"}
              onPress={() => setAllowMultiple(!allowMultipleRoles)}
            />
          </Row>
          <Row>
            {ROLES.map((role) => (
              <Btn
                key={role}
                title={role}
                variant={staffRoles.includes(role) ? "primary" : "ghost"}
                onPress={() => toggleRole(role)}
              />
            ))}
          </Row>
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
      {(profiles ?? []).map((profile) => (
        <Card key={profile._id}>
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
                <Btn
                  title="Edit"
                  variant="ghost"
                  onPress={() => selectPerson(profile.email)}
                />
                <Btn
                  title="Remove"
                  variant="danger"
                  onPress={() =>
                    confirmRemoval(
                      `Remove ${profile.email} from ${selectedYear}? Their roles and department assignment for the year will be deleted.`,
                      () =>
                        void run(() =>
                          removeStaffProfile({ email: profile.email, year: selectedYear })
                        )
                    )
                  }
                />
              </>
            )}
          </Row>
        </Card>
      ))}

      <SectionTitle>Divisions — {selectedYear}</SectionTitle>
      {(structure?.divisions ?? []).map((division) => (
        <Card key={division.name}>
          <Txt style={{ fontWeight: "600" }}>{division.name}</Txt>
          <Muted>Head: {division.headEmail ?? "none"}</Muted>
        </Card>
      ))}
      {editable && (
        <Card>
          <Field
            label="Division name (existing name updates that division)"
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
            title="Save Division"
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
      {(structure?.departments ?? []).map((department) => (
        <Card key={department.name}>
          <Txt style={{ fontWeight: "600" }}>{department.name}</Txt>
          <Muted>
            Division: {department.division} • Head: {department.headEmail ?? "none"}
          </Muted>
        </Card>
      ))}
      {editable && (
        <Card>
          <Field
            label="Department name"
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
            title="Save Department"
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

      <SectionTitle>Budget Manager — {selectedYear}</SectionTitle>
      <Card>
        <Muted>
          Current: {structure?.budgetManagerEmail ?? "not set"} (must be from the
          Finance department)
        </Muted>
        {editable && (
          <>
            <Select
              label="Budget Manager (Finance department members)"
              value={budgetManagerEmail}
              options={(people ?? [])
                .filter((person) => person.department === "Finance")
                .map((person) => ({
                  label: person.name ? `${person.name} (${person.email})` : person.email,
                  value: person.email,
                }))}
              onSelect={setBudgetManagerEmail}
              placeholder="Choose a Finance member…"
            />
            <Btn
              title="Set Budget Manager"
              onPress={() =>
                void run(() =>
                  setBudgetManager({ year: selectedYear, email: budgetManagerEmail })
                ).then((ok) => ok && setBudgetManagerEmail(""))
              }
            />
          </>
        )}
      </Card>
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
    width: "100%",
    alignSelf: "center",
  },
  yearItem: { paddingHorizontal: 16, paddingVertical: 12 },
});
