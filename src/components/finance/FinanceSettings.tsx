import { useQuery } from "convex/react";
import { useState } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { api } from "@convex/_generated/api";
import { DIRECTOR_APPROVAL_THRESHOLD } from "@shared/flow";
import { EVENT_DIRECTOR_APPROVAL_THRESHOLD } from "@shared/eventRequests";
import { StepTimingCard } from "@/components/admin/StepTimingCard";
import {
  Btn,
  Card,
  ConfirmDialog,
  currencyText,
  ErrorBanner,
  errorMessage,
  Field,
  formatAmount,
  IconButton,
  Muted,
  LoadingState,
  Row,
  SectionTitle,
  Segmented,
  Select,
  Txt,
} from "@/components/ui";
import { useAdminMutations } from "@/hooks/useAdminMutations";
import { spacing, useAppTheme } from "@/theme";

export const useFinanceSettingsAccess = (year: number | undefined) =>
  useQuery(api.admin.financeSettingsRole, year === undefined ? "skip" : { year });

const useRun = () => {
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
  return { error, run };
};

const YearPicker = ({
  currentYear,
  year,
  onChange,
}: {
  currentYear: number;
  year: number;
  onChange: (year: number) => void;
}) => (
  <Segmented
    segments={[
      { key: String(currentYear), label: `${currentYear}` },
      { key: String(currentYear + 1), label: `${currentYear + 1}` },
    ]}
    active={String(year)}
    onChange={(key) => onChange(Number(key))}
  />
);

const ThresholdCard = ({
  title,
  explanation,
  configured,
  standard,
  editable,
  buttonTitle,
  onSave,
}: {
  title: string;
  explanation: string;
  configured: number | null;
  standard: number;
  editable: boolean;
  buttonTitle: string;
  onSave: (amount: number) => Promise<boolean>;
}) => {
  const [input, setInput] = useState<string | null>(null);
  const value = input ?? String(configured ?? standard);
  const amount = Number(value);
  const unchanged = amount === (configured ?? standard) || value.trim() === "";
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>{title}</SectionTitle>
      <Card>
        <Muted>
          {explanation}
          {configured == null ? ` Using the standard default of $${formatAmount(standard)}.` : ""}
        </Muted>
        {editable ? (
          <>
            <Field
              label="Threshold ($)"
              value={value}
              onChangeText={(text) => setInput(currencyText(text))}
              keyboardType="decimal-pad"
            />
            <Btn
              title={buttonTitle}
              disabled={!(amount > 0) || unchanged}
              onPress={() => void onSave(amount).then((ok) => ok && setInput(null))}
            />
          </>
        ) : (
          <Muted>Threshold: ${(configured ?? standard).toLocaleString("en-AU")}</Muted>
        )}
      </Card>
    </View>
  );
};

export const FinanceSettingsPanel = ({ currentYear }: { currentYear: number }) => {
  const t = useAppTheme();
  const [year, setYear] = useState(currentYear);
  const access = useFinanceSettingsAccess(year);
  const canView = access?.canView === true;
  const editable = access?.canEdit === true;
  const structure = useQuery(api.directory.yearStructure, canView ? { year } : "skip");
  const financeMembers = useQuery(api.admin.financeMembers, canView ? { year } : "skip");
  const people = useQuery(api.admin.people, canView ? { year } : "skip");
  const delegations = useQuery(api.admin.listDelegations, canView ? { year } : "skip");
  const {
    setBudgetManager,
    setDirectorThreshold,
    setEventDirectorThreshold,
    addDelegation,
    removeDelegation,
  } = useAdminMutations();
  const { error, run } = useRun();
  const [budgetManagerEmail, setBudgetManagerEmail] = useState<string | null>(null);
  const [delegationFrom, setDelegationFrom] = useState("");
  const [delegationTo, setDelegationTo] = useState("");
  const [removing, setRemoving] = useState<NonNullable<typeof delegations>[number] | null>(null);
  const changeYear = (next: number) => {
    setYear(next);
    setBudgetManagerEmail(null);
    setDelegationFrom("");
    setDelegationTo("");
  };
  if (access === undefined) return <LoadingState />;
  if (!canView) {
    return <Muted>Only the finance team and admins can see the finance settings.</Muted>;
  }
  const yearPicker = <YearPicker currentYear={currentYear} year={year} onChange={changeYear} />;
  if (structure === undefined) {
    return (
      <View style={{ gap: spacing.lg }}>
        {yearPicker}
        <LoadingState />
      </View>
    );
  }
  const budgetManagerValue = budgetManagerEmail ?? structure?.budgetManagerEmail ?? "";
  const financeOptions = (financeMembers ?? []).map((person) => ({
    label: person.name ?? person.email,
    value: person.email,
  }));
  const personOptions = (people ?? []).map((person) => ({
    label: person.name ?? person.email,
    value: person.email,
  }));
  const nameByEmail = new Map((people ?? []).map((p) => [p.email, p.name]));
  const nameOf = (email: string) => nameByEmail.get(email) ?? email;
  return (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
      {yearPicker}
      {editable ? null : (
        <Muted>Only the Finance Head, whoever covers for them, and admins can change these.</Muted>
      )}
      <ErrorBanner message={error} />
      <View style={{ gap: spacing.md }}>
        <SectionTitle>Budget Manager · {year}</SectionTitle>
        <Card>
          <Select
            label="Budget Manager"
            value={editable ? budgetManagerValue : structure?.budgetManagerEmail ?? ""}
            options={financeOptions}
            onSelect={editable ? setBudgetManagerEmail : () => {}}
            disabled={!editable}
            placeholder={editable ? "Choose a finance team member…" : "Not set"}
          />
          {editable ? (
            <Btn
              title="Set Budget Manager"
              disabled={
                !budgetManagerValue || budgetManagerValue === (structure?.budgetManagerEmail ?? "")
              }
              onPress={() =>
                void run(() => setBudgetManager({ year, email: budgetManagerValue })).then(
                  (ok) => ok && setBudgetManagerEmail(null)
                )
              }
            />
          ) : null}
        </Card>
      </View>
      <ThresholdCard
        key={`director-${year}`}
        title={`Reimbursement Director threshold · ${year}`}
        explanation="Reimbursements at or above this amount also need the Director's approval. Only affects requests submitted from now on."
        configured={structure?.directorApprovalThreshold ?? null}
        standard={DIRECTOR_APPROVAL_THRESHOLD}
        editable={editable}
        buttonTitle="Set threshold"
        onSave={(amount) => run(() => setDirectorThreshold({ year, amount }))}
      />
      <ThresholdCard
        key={`event-${year}`}
        title={`Event Director threshold · ${year}`}
        explanation="Event requests whose Finance form has total expenses over this amount also need the Director's approval, before the Finance Head's. Only affects Finance forms submitted from now on."
        configured={structure?.eventDirectorApprovalThreshold ?? null}
        standard={EVENT_DIRECTOR_APPROVAL_THRESHOLD}
        editable={editable}
        buttonTitle="Set event threshold"
        onSave={(amount) => run(() => setEventDirectorThreshold({ year, amount }))}
      />
      <View style={{ gap: spacing.md }}>
        <SectionTitle>Approver delegation · {year}</SectionTitle>
        <Card>
          <Muted>A delegate can approve, decline and pay for their approver this staff year.</Muted>
          {(delegations ?? []).length === 0 ? <Muted>No delegations set.</Muted> : null}
          {(delegations ?? []).map((d) => (
            <Row key={d.id}>
              <Txt style={{ flexGrow: 1 }}>{`${nameOf(d.fromEmail)}  →  ${nameOf(d.toEmail)}`}</Txt>
              {editable ? (
                <IconButton
                  name="close"
                  size={32}
                  color={t.danger}
                  accessibilityLabel="Remove delegation"
                  onPress={() => setRemoving(d)}
                />
              ) : null}
            </Row>
          ))}
          {editable ? (
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
                title="Add delegation"
                disabled={!delegationFrom || !delegationTo || delegationFrom === delegationTo}
                onPress={() =>
                  void run(() =>
                    addDelegation({ year, fromEmail: delegationFrom, toEmail: delegationTo })
                  ).then((ok) => {
                    if (ok) {
                      setDelegationFrom("");
                      setDelegationTo("");
                    }
                  })
                }
              />
            </>
          ) : null}
        </Card>
      </View>
      <StepTimingCard year={year} />
      <ConfirmDialog
        visible={removing !== null}
        title="Remove delegation?"
        message={
          removing
            ? `${nameOf(removing.fromEmail)} → ${nameOf(removing.toEmail)}: the delegate can no longer act for the approver in ${year}.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) void run(() => removeDelegation({ id: removing.id }));
        }}
        onClose={() => setRemoving(null)}
      />
    </View>
  );
};

export const FinanceSettingsButton = ({ year }: { year: number }) => {
  const router = useRouter();
  const access = useFinanceSettingsAccess(year);
  if (!access?.canView) return null;
  return (
    <Row>
      <Btn
        title="Finance settings"
        variant="tonal"
        icon="settings-outline"
        onPress={() => router.push("/finance-settings" as never)}
      />
    </Row>
  );
};
