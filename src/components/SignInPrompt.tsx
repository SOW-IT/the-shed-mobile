import { View } from "react-native";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { Btn, EmptyState, ErrorBanner, ReadableColumn } from "@/components/ui";
import { spacing } from "@/theme";

/**
 * For a link opened while signed out (an emailed link on a phone's browser,
 * say): sign in with a SOW account and come back to this page.
 */
export const SignInPrompt = ({ what }: { what: string }) => {
  const sow = useGoogleSignIn("google");
  return (
    <ReadableColumn>
      <EmptyState
        icon="lock-closed-outline"
        title={`Sign in to see this ${what}`}
        message="Use your SOW Google account. You'll come straight back here."
      />
      <View style={{ gap: spacing.sm, alignItems: "center" }}>
        <Btn
          title="Sign in with Google"
          icon="logo-google"
          loading={sow.busy}
          onPress={() => void sow.signInWithGoogle()}
        />
        <ErrorBanner message={sow.error} />
      </View>
    </ReadableColumn>
  );
};
