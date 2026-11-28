import { useQuery } from "convex/react";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@convex/_generated/api";
import { SuggestedMerges } from "@/components/attendance/SuggestedMerges";
import { EmptyState, ErrorBanner, errorMessage, LoadingState, Toast, type ToastState } from "@/components/ui";
import { spacing } from "@/theme";

export const useMergeSuggestions = (enabled: boolean) => {
  const suggestions = useQuery(api.mergeSuggestions.list, enabled ? {} : "skip");
  const pairs = useQuery(api.memberPairSuggestions.list, enabled ? {} : "skip");
  const count =
    (suggestions ?? []).reduce((n, s) => n + s.candidates.length, 0) + (pairs ?? []).length;
  return { suggestions, pairs, count };
};

export const MergesTab = ({ staffYear }: { staffYear: number }) => {
  const { suggestions, pairs } = useMergeSuggestions(true);
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
  if (!suggestions || !pairs) return <LoadingState />;
  return (
    <View style={{ gap: spacing.md }}>
      <ErrorBanner message={error} />
      {suggestions.length === 0 && pairs.length === 0 ? (
        <EmptyState
          icon="git-merge-outline"
          title="No possible duplicates"
          message="Members who look like the same person show up here."
        />
      ) : null}
      <SuggestedMerges
        suggestions={suggestions}
        memberPairs={pairs}
        staffYear={staffYear}
        run={run}
        onMerged={(summary) => setToast({ text: summary })}
      />
      <Toast toast={toast} />
    </View>
  );
};
