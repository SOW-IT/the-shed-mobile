import { useState } from "react";
import {
  answersProblemAt,
  type FormAnswers,
  type FormField,
  normalizeAnswers,
  questionNumber,
} from "@shared/forms";
import { errorMessage } from "@/components/ui";
import { answersFromDraft, type FormDraft } from "./FormQuestions";

export const useFormSave = () => {
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async ({
    fields,
    draft,
    today,
    previous,
    persist,
  }: {
    fields: readonly FormField[];
    draft: FormDraft;
    today: string;
    previous?: FormAnswers;
    persist: (answers: FormAnswers) => Promise<void>;
  }) => {
    if (saving) return;
    const answers = normalizeAnswers(fields, answersFromDraft(fields, draft));
    const found = answersProblemAt(fields, answers, today, previous);
    setProblem(found);
    if (found) {
      const number = questionNumber(fields, answers, found.key);
      setError(number === undefined ? found.message : `Question ${number}: ${found.message}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await persist(answers);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    if (error) setError(null);
    if (problem) setProblem(null);
  };

  return { error, problem, saving, save, clear };
};
