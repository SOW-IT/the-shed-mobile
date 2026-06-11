import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { HEAD_OF_DIVISION, ROLES } from "../../shared/flow";
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
  Txt,
} from "@/components/ui";

/**
 * Admin console: per-year staff roles/departments (including people who
 * haven't signed in yet, by email), divisions, departments and the Budget
 * Manager. Admins can EDIT the current year and the next one (next-year
 * changes take effect at the September 1 rollover) and VIEW any past year.
 */
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
  const directory = useQuery(
    api.directorySync.list,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );
  const requestDirectorySync = useMutation(api.directorySync.requestSync);

  const setStaffProfile = useMutation(api.admin.setStaffProfile);
  const removeStaffProfile = useMutation(api.admin.removeStaffProfile);
  const upsertDivision = useMutation(api.admin.upsertDivision);
  const upsertDepartment = useMutation(api.admin.upsertDepartment);
  const setBudgetManager = useMutation(api.admin.setBudgetManager);

  const [error, setError] = useState<string | null>(null);
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

  // Staff form — a person can hold multiple roles.
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRoles, setStaffRoles] = useState<string[]>([ROLES[0]]);
  const [staffDepartment, setStaffDepartment] = useState("");
  const [staffDivision, setStaffDivision] = useState("");
  const toggleRole = (role: string) =>
    setStaffRoles((previous) =>
      previous.includes(role)
        ? previous.filter((r) => r !== role)
        : [...previous, role]
    );
  // Division / department forms
  const [divisionName, setDivisionName] = useState("");
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
  const needsDepartment = staffRoles.some((role) => role !== HEAD_OF_DIVISION);
  const yearLabel = (y: number) =>
    y === currentYear
      ? `${y} (current)`
      : y === currentYear + 1
        ? `${y} (from Sep 1)`
        : `${y}`;

  return (
    <Screen>
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
                  onPress={() => setStaffEmail(user.email)}
                />
              </Row>
            </Card>
          ))}
        </>
      )}

      <SectionTitle>Staff — {selectedYear}</SectionTitle>
      {editable && (
        <Card>
          {(directory?.users ?? []).some((user) => !user.hasProfile) && (
            <Select
              label={`Pick from the Google Workspace directory (${
                (directory?.users ?? []).filter((u) => !u.hasProfile).length
              } unassigned)`}
              value={staffEmail}
              options={(directory?.users ?? [])
                .filter((user) => !user.hasProfile)
                .map((user) => user.email)}
              onSelect={setStaffEmail}
              placeholder="Choose a person…"
            />
          )}
          <Field
            label="Email (they don't need to have signed in yet)"
            value={staffEmail}
            onChangeText={setStaffEmail}
            placeholder="someone@sow.org.au"
            keyboardType="email-address"
          />
          <Muted>Roles (tap to toggle — a person can hold several)</Muted>
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
            <>
              <Muted>Division (Heads of Division belong directly to one)</Muted>
              <Row>
                {(structure?.divisions ?? []).map((division) => (
                  <Btn
                    key={division}
                    title={division}
                    variant={staffDivision === division ? "primary" : "ghost"}
                    onPress={() => setStaffDivision(division)}
                  />
                ))}
              </Row>
            </>
          )}
          {needsDepartment && (
            <>
              <Muted>Department</Muted>
              <Row>
                {(structure?.departments ?? []).map((department) => (
                  <Btn
                    key={department.name}
                    title={department.name}
                    variant={staffDepartment === department.name ? "primary" : "ghost"}
                    onPress={() => setStaffDepartment(department.name)}
                  />
                ))}
              </Row>
            </>
          )}
          <Btn
            title="Save Staff Assignment"
            onPress={() =>
              void run(() =>
                setStaffProfile({
                  email: staffEmail,
                  year: selectedYear,
                  roles: staffRoles,
                  department: needsDepartment ? staffDepartment : undefined,
                  division: needsDivision ? staffDivision : undefined,
                })
              ).then((ok) => ok && setStaffEmail(""))
            }
          />
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Muted>
                Workspace directory:{" "}
                {directory?.syncedAt
                  ? `${directory.status} • ${new Date(directory.syncedAt).toLocaleString()}`
                  : "not synced yet — configure the Google service account (see README)"}
              </Muted>
            </View>
            <Btn
              title="Sync Directory"
              variant="ghost"
              onPress={() => void run(() => requestDirectorySync({}))}
            />
          </Row>
        </Card>
      )}
      {(profiles ?? []).map((profile) => (
        <Card key={profile._id}>
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Txt style={{ fontWeight: "600" }}>{profile.email}</Txt>
              <Muted>
                {profile.roles.join(", ")} •{" "}
                {[profile.department, profile.division].filter(Boolean).join(" / ") || "—"}
              </Muted>
            </View>
            {editable && (
              <Btn
                title="Remove"
                variant="danger"
                onPress={() =>
                  void run(() =>
                    removeStaffProfile({ email: profile.email, year: selectedYear })
                  )
                }
              />
            )}
          </Row>
        </Card>
      ))}

      <SectionTitle>Divisions — {selectedYear}</SectionTitle>
      <Card>
        <Muted>{(structure?.divisions ?? []).join(", ") || "None yet."}</Muted>
        {editable && (
          <>
            <Field
              label="New division"
              value={divisionName}
              onChangeText={setDivisionName}
            />
            <Btn
              title="Add Division"
              onPress={() =>
                void run(() =>
                  upsertDivision({ year: selectedYear, name: divisionName })
                ).then((ok) => ok && setDivisionName(""))
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
          <Muted>Division</Muted>
          <Row>
            {(structure?.divisions ?? []).map((division) => (
              <Btn
                key={division}
                title={division}
                variant={departmentDivision === division ? "primary" : "ghost"}
                onPress={() => setDepartmentDivision(division)}
              />
            ))}
          </Row>
          <Field
            label="Head of Department email (optional)"
            value={departmentHead}
            onChangeText={setDepartmentHead}
            keyboardType="email-address"
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
            <Field
              label="Budget Manager email"
              value={budgetManagerEmail}
              onChangeText={setBudgetManagerEmail}
              keyboardType="email-address"
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
