import { ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import {
  isFieldShown,
  otherKey,
  type DesignAnswer,
  type DesignAnswers,
  type DesignField,
} from "@shared/designRequests";
import { NativeDateInput } from "@/components/NativeDateTimeField";
import { WebDateInput } from "@/components/WebDateTimeInput";
import {
  Card,
  currencyText,
  Field,
  Muted,
  OptionRow,
  Segmented,
  Select,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/**
 * The form's working copy of the answers. Amounts stay as typed text until
 * they're submitted, so "12." can be on its way to "12.50".
 */
export type DesignRequestDraft = Record<string, DesignAnswer>;

/** A blank form: the requester's department filled in, yes/no questions on No. */
export const emptyDraft = (
  fields: readonly DesignField[],
  department: string
): DesignRequestDraft => {
  const draft: DesignRequestDraft = {};
  for (const field of fields) {
    if (field.kind === "department" && department) draft[field.key] = department;
    if (field.kind === "yesNo") draft[field.key] = false;
  }
  return draft;
};

export const draftFromAnswers = (
  fields: readonly DesignField[],
  answers: DesignAnswers
): DesignRequestDraft => {
  const draft: DesignRequestDraft = { ...emptyDraft(fields, ""), ...answers };
  for (const field of fields) {
    const value = answers[field.key];
    if (field.kind === "money" && typeof value === "number") draft[field.key] = String(value);
  }
  return draft;
};

/** The draft as answers to submit: amounts typed as text become numbers. */
export const answersFromDraft = (
  fields: readonly DesignField[],
  draft: DesignRequestDraft
): DesignAnswers => {
  const answers: DesignAnswers = { ...draft };
  for (const field of fields) {
    const value = draft[field.key];
    if (field.kind !== "money" || typeof value !== "string") continue;
    if (value.trim() === "") delete answers[field.key];
    else answers[field.key] = Number(value);
  }
  return answers;
};

const toggle = (values: string[], value: string): string[] =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

const Question = ({
  number,
  field,
  children,
}: {
  number: number;
  field: DesignField;
  children: ReactNode;
}) => {
  const t = useAppTheme();
  return (
    <Card>
      <Text style={[typography.headline, { color: t.text }]}>
        {number}. {field.label}
        {field.required ? <Text style={{ color: t.danger }}> *</Text> : null}
      </Text>
      {field.hint ? <Muted>{field.hint}</Muted> : null}
      {children}
    </Card>
  );
};

const FieldInput = ({
  field,
  draft,
  set,
  departments,
  minDate,
}: {
  field: DesignField;
  draft: DesignRequestDraft;
  set: (key: string, value: DesignAnswer) => void;
  departments: string[];
  minDate: string;
}) => {
  const value = draft[field.key];
  const text = typeof value === "string" ? value : "";
  switch (field.kind) {
    case "department":
      return (
        <Select
          label="Department"
          value={text}
          options={departments}
          onSelect={(v) => set(field.key, v)}
          placeholder="Pick a department"
        />
      );
    case "checkboxes": {
      const ticked = Array.isArray(value) ? value : [];
      const other = draft[otherKey(field)];
      return (
        <>
          <View>
            {(field.options ?? []).map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                multi
                selected={ticked.includes(option.value)}
                onPress={() => set(field.key, toggle(ticked, option.value))}
              />
            ))}
          </View>
          {field.otherOption && ticked.includes(field.otherOption) ? (
            <Field
              label="Other"
              value={typeof other === "string" ? other : ""}
              onChangeText={(v) => set(otherKey(field), v)}
              placeholder={field.placeholder}
              autoCapitalize="sentences"
            />
          ) : null}
        </>
      );
    }
    case "money":
      return (
        <Field
          accessibilityLabel={`${field.shortLabel} in dollars`}
          value={text}
          onChangeText={(v) => set(field.key, currencyText(v))}
          keyboardType="decimal-pad"
          placeholder={field.placeholder ?? "$0.00"}
        />
      );
    case "date":
      return Platform.OS === "web" ? (
        <WebDateInput
          label={field.shortLabel}
          value={text}
          min={field.notInPast ? minDate : undefined}
          onChange={(v) => set(field.key, v)}
        />
      ) : (
        <NativeDateInput
          label={field.shortLabel}
          value={text}
          min={field.notInPast ? minDate : undefined}
          onChange={(v) => set(field.key, v)}
        />
      );
    case "yesNo":
      return (
        <Segmented
          segments={[
            { key: "yes", label: "Yes" },
            { key: "no", label: "No" },
          ]}
          active={value === true ? "yes" : "no"}
          onChange={(key) => set(field.key, key === "yes")}
        />
      );
    default:
      return (
        <Field
          accessibilityLabel={field.shortLabel}
          value={text}
          onChangeText={(v) => set(field.key, v)}
          placeholder={field.placeholder}
          multiline={field.kind === "longText"}
          maxLength={field.maxLength}
          autoCapitalize="sentences"
        />
      );
  }
};

/**
 * The design request questions as the server defines them. Numbering follows
 * what's on screen, so a question that only applies sometimes (the Bible
 * passage, for events) doesn't leave a gap when it's hidden.
 */
export const DesignRequestForm = ({
  fields,
  draft,
  onChange,
  departments,
  minDate,
}: {
  fields: readonly DesignField[];
  draft: DesignRequestDraft;
  onChange: (draft: DesignRequestDraft) => void;
  departments: string[];
  /** The earliest date a "not in the past" question accepts. */
  minDate: string;
}) => {
  const set = (key: string, value: DesignAnswer) => onChange({ ...draft, [key]: value });
  const shown = fields.filter((field) => isFieldShown(field, draft));
  return (
    <View style={{ gap: spacing.md }}>
      {shown.map((field, index) => (
        <Question key={field.key} number={index + 1} field={field}>
          <FieldInput
            field={field}
            draft={draft}
            set={set}
            departments={departments}
            minDate={minDate}
          />
        </Question>
      ))}
    </View>
  );
};
