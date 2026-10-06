import { Ionicons } from "@expo/vector-icons";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  financeTotals,
  type FinanceData,
  type FinanceLine,
} from "@shared/eventRequests";
import { formatAmount, sumAmounts } from "@shared/money";
import { Btn, Card, currencyText, Field, Muted } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

type LineDraft = { key: string; label: string; amount: string };

/** The Finance form while it's being filled in: amounts stay as typed text. */
export type FinanceDraft = { income: LineDraft[]; expenses: LineDraft[]; spreadsheetUrl: string };

let nextKey = 0;
const line = (l?: FinanceLine): LineDraft => ({
  key: `line-${nextKey++}`,
  label: l?.label ?? "",
  amount: l ? String(l.amount) : "",
});

export const financeDraftFrom = (data: FinanceData | undefined): FinanceDraft => ({
  income: (data?.income ?? []).map(line),
  expenses: (data?.expenses.length ? data.expenses : [undefined]).map(line),
  spreadsheetUrl: data?.spreadsheetUrl ?? "",
});

export const financeDataFrom = (draft: FinanceDraft): FinanceData => {
  const lines = (rows: LineDraft[]) =>
    rows.map((r) => ({ label: r.label, amount: r.amount.trim() ? Number(r.amount) : 0 }));
  return {
    income: lines(draft.income),
    expenses: lines(draft.expenses),
    ...(draft.spreadsheetUrl.trim() ? { spreadsheetUrl: draft.spreadsheetUrl } : {}),
  };
};

const money = (amount: number) => `${amount < 0 ? "-" : ""}$${formatAmount(Math.abs(amount))}`;

const Lines = ({
  title,
  hint,
  rows,
  addLabel,
  placeholder,
  onChange,
}: {
  title: string;
  hint: string;
  rows: LineDraft[];
  addLabel: string;
  placeholder: string;
  onChange: (rows: LineDraft[]) => void;
}) => {
  const t = useAppTheme();
  const total = sumAmounts(rows.map((r) => Number(r.amount) || 0));
  return (
    <Card>
      <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
      <Muted>{hint}</Muted>
      {rows.map((row) => (
        <View key={row.key} style={styles.line}>
          <View style={{ flex: 2 }}>
            <Field
              accessibilityLabel={`${title}: what it's for`}
              value={row.label}
              onChangeText={(label) =>
                onChange(rows.map((r) => (r.key === row.key ? { ...r, label } : r)))
              }
              placeholder={placeholder}
              autoCapitalize="sentences"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              accessibilityLabel={`${title}: amount in dollars`}
              value={row.amount}
              onChangeText={(text) =>
                onChange(
                  rows.map((r) => (r.key === row.key ? { ...r, amount: currencyText(text) } : r))
                )
              }
              keyboardType="decimal-pad"
              placeholder="$0.00"
            />
          </View>
          <Pressable
            onPress={() => onChange(rows.filter((r) => r.key !== row.key))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${row.label || "this line"}`}
            hitSlop={8}
            style={({ pressed }) => [styles.remove, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="close-circle" size={22} color={t.faint} />
          </Pressable>
        </View>
      ))}
      <View style={styles.footerRow}>
        <Btn title={addLabel} variant="tonal" onPress={() => onChange([...rows, line()])} />
        <Text style={[typography.headline, { color: t.text }]}>Total {money(total)}</Text>
      </View>
    </Card>
  );
};

/** The Finance form: a simple rundown of income and expenses, totalled. */
export const FinanceFormEditor = ({
  draft,
  onChange,
  directorThreshold,
}: {
  draft: FinanceDraft;
  onChange: (draft: FinanceDraft) => void;
  directorThreshold: number;
}) => {
  const t = useAppTheme();
  const totals = financeTotals(financeDataFrom(draft));
  const note =
    totals.income === 0 && totals.expenses === 0
      ? "No money in or out: Finance won't need to approve this, but they'll be told."
      : totals.expenses > directorThreshold
        ? `Expenses are over $${formatAmount(directorThreshold)}, so the Director approves this first, then the Finance Head.`
        : "The Finance Head approves this.";
  return (
    <View style={{ gap: spacing.md }}>
      <Lines
        title="Income"
        hint="Registrations, sponsorships, sales, anything coming in. Leave empty if there's none."
        rows={draft.income}
        addLabel="+ Add Income"
        placeholder="e.g. Registrations (100 × $30)"
        onChange={(income) => onChange({ ...draft, income })}
      />
      <Lines
        title="Expenses"
        hint="Venue, food, printing, transport, anything going out."
        rows={draft.expenses}
        addLabel="+ Add Expense"
        placeholder="e.g. Venue hire"
        onChange={(expenses) => onChange({ ...draft, expenses })}
      />
      <Card>
        <Summary income={totals.income} expenses={totals.expenses} />
        <Muted>{note}</Muted>
      </Card>
      <Card>
        <Text style={[typography.headline, { color: t.text }]}>Spreadsheet (optional)</Text>
        <Muted>A link to a spreadsheet with the full rundown of costs, if you have one.</Muted>
        <Field
          accessibilityLabel="Spreadsheet link"
          value={draft.spreadsheetUrl}
          onChangeText={(spreadsheetUrl) => onChange({ ...draft, spreadsheetUrl })}
          placeholder="https://"
        />
      </Card>
    </View>
  );
};

const Summary = ({ income, expenses }: { income: number; expenses: number }) => {
  const t = useAppTheme();
  const rows: [string, number][] = [
    ["Total income", income],
    ["Total costs", expenses],
    ["Net", income - expenses],
  ];
  return (
    <View style={{ gap: 4 }}>
      {rows.map(([label, amount], i) => (
        <View key={label} style={styles.summaryRow}>
          <Text style={[typography.body, { color: t.text, fontWeight: i === 2 ? "700" : "400" }]}>
            {label}
          </Text>
          <Text
            style={[
              typography.body,
              { color: i === 2 && amount < 0 ? t.danger : t.text, fontWeight: i === 2 ? "700" : "400" },
            ]}
          >
            {money(amount)}
          </Text>
        </View>
      ))}
    </View>
  );
};

/** A submitted Finance form, read-only. */
export const FinanceView = ({ data }: { data: FinanceData }) => {
  const t = useAppTheme();
  const totals = financeTotals(data);
  const table = (title: string, lines: FinanceLine[], total: number) => (
    <Card>
      <Text style={[typography.headline, { color: t.text }]}>{title}</Text>
      {lines.length === 0 ? <Muted>None</Muted> : null}
      {lines.map((l, i) => (
        <View key={i} style={styles.summaryRow}>
          <Text selectable style={[typography.body, { color: t.text, flex: 1 }]}>
            {l.label}
          </Text>
          <Text style={[typography.body, { color: t.text }]}>{money(l.amount)}</Text>
        </View>
      ))}
      <View style={styles.summaryRow}>
        <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>Total</Text>
        <Text style={[typography.body, { color: t.text, fontWeight: "700" }]}>{money(total)}</Text>
      </View>
    </Card>
  );
  return (
    <View style={{ gap: spacing.md }}>
      {table("Income", data.income, totals.income)}
      {table("Expenses", data.expenses, totals.expenses)}
      <Card>
        <Summary income={totals.income} expenses={totals.expenses} />
      </Card>
      {data.spreadsheetUrl ? (
        <Btn
          title="Open the Spreadsheet"
          variant="tonal"
          icon="open-outline"
          onPress={() => void Linking.openURL(data.spreadsheetUrl!).catch(() => {})}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  remove: { paddingTop: 12 },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
});
