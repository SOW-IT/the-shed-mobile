import { ReactNode } from "react";
import { Platform, Text, View } from "react-native";
import {
  isFieldShown,
  offeredOptions,
  otherKey,
  type FormAnswer,
  type FormAnswers,
  type FormField,
} from "@shared/forms";
import { EVENT_SIZE_LABELS, type EventSize } from "@shared/eventRequests";
import { NativeDateInput, NativeTimeInput } from "@/components/NativeDateTimeField";
import { WebDateInput, WebTimeInput } from "@/components/WebDateTimeInput";
import {
  Card,
  currencyText,
  digitsOnly,
  Field,
  Muted,
  OptionRow,
  SectionTitle,
  Segmented,
  Select,
} from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";

/**
 * The form's working copy of the answers. Amounts and counts stay as typed
 * text until they're submitted, so "12." can be on its way to "12.50", and a
 * date-time is "2026-01-12T13:00" even while only half of it is picked.
 */
export type FormDraft = Record<string, FormAnswer>;

/** A blank form: the department filled in, yes/no questions on No. */
export const emptyDraft = (fields: readonly FormField[], department: string): FormDraft => {
  const draft: FormDraft = {};
  for (const field of fields) {
    if (field.kind === "department" && department) draft[field.key] = department;
    if (field.kind === "yesNo") draft[field.key] = false;
  }
  return draft;
};

const typedAsText = (field: FormField) => field.kind === "money" || field.kind === "number";

export const draftFromAnswers = (
  fields: readonly FormField[],
  answers: FormAnswers
): FormDraft => {
  const draft: FormDraft = { ...emptyDraft(fields, ""), ...answers };
  for (const field of fields) {
    const value = answers[field.key];
    if (typedAsText(field) && typeof value === "number") draft[field.key] = String(value);
  }
  return draft;
};

/** The draft as answers to submit: typed amounts become numbers, and cleared
 *  dates and half-picked date-times drop, so an optional date left empty isn't
 *  sent as "" (which reads as an invalid date). */
export const answersFromDraft = (fields: readonly FormField[], draft: FormDraft): FormAnswers => {
  const answers: FormAnswers = { ...draft };
  for (const field of fields) {
    const value = draft[field.key];
    if (typeof value !== "string") continue;
    if (typedAsText(field)) {
      if (value.trim() === "") delete answers[field.key];
      else answers[field.key] = Number(value);
    }
    if (field.kind === "date" && value === "") delete answers[field.key];
    if (field.kind === "dateTime" && (value === "T" || value === "")) delete answers[field.key];
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
  number?: number;
  field: FormField;
  children: ReactNode;
}) => {
  const t = useAppTheme();
  return (
    <Card>
      <Text style={[typography.headline, { color: t.text }]}>
        {number !== undefined ? `${number}. ` : ""}
        {field.label}
        {field.required ? <Text style={{ color: t.danger }}> *</Text> : null}
      </Text>
      {field.hint ? <Muted>{field.hint}</Muted> : null}
      {children}
    </Card>
  );
};

/** A date and a time, side by side, kept together as "2026-01-12T13:00". */
const DateTimeInput = ({
  field,
  value,
  onChange,
  minDate,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  minDate: string;
}) => {
  const [date = "", time = ""] = value.split("T");
  const min = field.notInPast ? minDate : undefined;
  const set = (d: string, tm: string) => onChange(d || tm ? `${d}T${tm}` : "");
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {Platform.OS === "web" ? (
        <>
          <WebDateInput
            label="Date"
            value={date}
            min={min}
            onChange={(d) => set(d, time)}
            onClear={field.required ? undefined : () => onChange("")}
          />
          <WebTimeInput label="Time" value={time} onChange={(tm) => set(date, tm)} />
        </>
      ) : (
        <>
          <View style={{ flex: 1 }}>
            <NativeDateInput
              label="Date"
              value={date}
              min={min}
              onChange={(d) => set(d, time || "09:00")}
              onClear={field.required ? undefined : () => onChange("")}
            />
          </View>
          <View style={{ flex: 1 }}>
            <NativeTimeInput label="Time" value={time} onChange={(tm) => set(date, tm)} />
          </View>
        </>
      )}
    </View>
  );
};

const FieldInput = ({
  field,
  draft,
  set,
  departments,
  minDate,
  size,
}: {
  field: FormField;
  draft: FormDraft;
  set: (key: string, value: FormAnswer) => void;
  departments: string[];
  minDate: string;
  size: EventSize | null;
}) => {
  const t = useAppTheme();
  const value = draft[field.key];
  const text = typeof value === "string" ? value : "";
  const recommendedBadge = (recommended: readonly string[] | undefined) =>
    size && recommended?.includes(size) ? "Recommended" : undefined;
  switch (field.kind) {
    case "department":
      return departments.length === 1 ? (
        <Text style={[typography.body, { color: t.text }]}>{departments[0]}</Text>
      ) : (
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
            {offeredOptions(field, ticked).map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                multi
                badge={recommendedBadge(option.recommended)}
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
    case "choice":
      return (
        <View>
          {offeredOptions(field, text ? [text] : []).map((option) => (
            <OptionRow
              key={option.value}
              label={option.label}
              selected={text === option.value}
              onPress={() => set(field.key, option.value)}
            />
          ))}
        </View>
      );
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
    case "number":
      return (
        <Field
          accessibilityLabel={field.shortLabel}
          value={text}
          onChangeText={(v) => set(field.key, digitsOnly(v))}
          keyboardType="numeric"
          placeholder={field.placeholder ?? "0"}
        />
      );
    case "date":
      return Platform.OS === "web" ? (
        <WebDateInput
          label={field.shortLabel}
          value={text}
          min={field.notInPast ? minDate : undefined}
          onChange={(v) => set(field.key, v)}
          onClear={field.required ? undefined : () => set(field.key, "")}
        />
      ) : (
        <NativeDateInput
          label={field.shortLabel}
          value={text}
          min={field.notInPast ? minDate : undefined}
          onChange={(v) => set(field.key, v)}
          onClear={field.required ? undefined : () => set(field.key, "")}
        />
      );
    case "dateTime":
      return (
        <DateTimeInput
          field={field}
          value={text}
          onChange={(v) => set(field.key, v)}
          minDate={minDate}
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
    case "url":
      return (
        <Field
          accessibilityLabel={field.shortLabel}
          value={text}
          onChangeText={(v) => set(field.key, v)}
          placeholder={field.placeholder ?? "https://"}
          maxLength={field.maxLength}
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
 * Questions as the server defines them. Numbering follows what's on screen,
 * so a question that only applies sometimes doesn't leave a gap when it's
 * hidden; follow-up questions (shown when a choice is ticked) aren't numbered.
 * With an event `size`, choices recommended for it are tagged.
 */
export const FormQuestions = ({
  fields,
  draft,
  onChange,
  departments,
  minDate,
  size = null,
}: {
  fields: readonly FormField[];
  draft: FormDraft;
  onChange: (draft: FormDraft) => void;
  departments: string[];
  /** The earliest date a "not in the past" question accepts. */
  minDate: string;
  size?: EventSize | null;
}) => {
  const set = (key: string, value: FormAnswer) => onChange({ ...draft, [key]: value });
  const shown = fields.filter((field) => isFieldShown(field, draft));
  let number = 0;
  return (
    <View style={{ gap: spacing.md }}>
      {size ? (
        <Muted>
          {`"Recommended" marks what usually suits a ${EVENT_SIZE_LABELS[size].toLowerCase()} event like this one.`}
        </Muted>
      ) : null}
      {shown.map((field) => (
        <View key={field.key} style={{ gap: spacing.md }}>
          {field.section ? <SectionTitle>{field.section}</SectionTitle> : null}
          <Question number={field.showWhen ? undefined : ++number} field={field}>
            <FieldInput
              field={field}
              draft={draft}
              set={set}
              departments={departments}
              minDate={minDate}
              size={size}
            />
          </Question>
        </View>
      ))}
    </View>
  );
};
