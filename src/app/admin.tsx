import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { ROLES } from "../../shared/flow";
import { api } from "../../convex/_generated/api";
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
  Txt,
} from "@/components/ui";

/**
 * Admin console: per-year staff roles/departments (including people who
 * haven't signed in yet, by email), divisions, departments and the Budget
 * Manager. Admins can manage the current year and the next one — next-year
 * changes take effect at the September 1 rollover.
 */
export default function AdminScreen() {
  const me = useQuery(api.directory.me);
  const currentYear = me?.year ?? new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const selectedYear = year ?? currentYear;

  const structure = useQuery(
    api.directory.yearStructure,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );
  const profiles = useQuery(
    api.admin.listStaffProfiles,
    me?.isAdmin ? { year: selectedYear } : "skip"
  );

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

  // Staff form
  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState<string>(ROLES[0]);
  const [staffDepartment, setStaffDepartment] = useState("");
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

  return (
    <Screen>
      <Row>
        <Btn
          title={`${currentYear} (current)`}
          variant={selectedYear === currentYear ? "primary" : "ghost"}
          onPress={() => setYear(currentYear)}
        />
        <Btn
          title={`${currentYear + 1} (from Sep 1)`}
          variant={selectedYear === currentYear + 1 ? "primary" : "ghost"}
          onPress={() => setYear(currentYear + 1)}
        />
      </Row>
      <ErrorBanner message={error} />

      <SectionTitle>Staff — {selectedYear}</SectionTitle>
      <Card>
        <Field
          label="Email (they don't need to have signed in yet)"
          value={staffEmail}
          onChangeText={setStaffEmail}
          placeholder="someone@sow.org.au"
          keyboardType="email-address"
        />
        <Muted>Role</Muted>
        <Row>
          {ROLES.map((role) => (
            <Btn
              key={role}
              title={role}
              variant={staffRole === role ? "primary" : "ghost"}
              onPress={() => setStaffRole(role)}
            />
          ))}
        </Row>
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
        <Btn
          title="Save Staff Assignment"
          onPress={() =>
            void run(() =>
              setStaffProfile({
                email: staffEmail,
                year: selectedYear,
                role: staffRole,
                department: staffDepartment,
              })
            ).then((ok) => ok && setStaffEmail(""))
          }
        />
      </Card>
      {(profiles ?? []).map((profile) => (
        <Card key={profile._id}>
          <Row>
            <View style={{ flexGrow: 1 }}>
              <Txt style={{ fontWeight: "600" }}>{profile.email}</Txt>
              <Muted>
                {profile.role} • {profile.department}
              </Muted>
            </View>
            <Btn
              title="Remove"
              variant="danger"
              onPress={() =>
                void run(() =>
                  removeStaffProfile({ email: profile.email, year: selectedYear })
                )
              }
            />
          </Row>
        </Card>
      ))}

      <SectionTitle>Divisions — {selectedYear}</SectionTitle>
      <Card>
        <Muted>{(structure?.divisions ?? []).join(", ") || "None yet."}</Muted>
        <Field label="New division" value={divisionName} onChangeText={setDivisionName} />
        <Btn
          title="Add Division"
          onPress={() =>
            void run(() =>
              upsertDivision({ year: selectedYear, name: divisionName })
            ).then((ok) => ok && setDivisionName(""))
          }
        />
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
      <Card>
        <Field label="Department name" value={departmentName} onChangeText={setDepartmentName} />
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

      <SectionTitle>Budget Manager — {selectedYear}</SectionTitle>
      <Card>
        <Muted>
          Current: {structure?.budgetManagerEmail ?? "not set"} (must be from the
          Finance department)
        </Muted>
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
      </Card>
    </Screen>
  );
}
