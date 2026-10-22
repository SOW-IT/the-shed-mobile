import { View } from "react-native";
import { alertSowAccountRequired } from "@/components/nav/SignInMenu";
import { useAppleSignInAvailable } from "@/hooks/useAppleSignIn";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { Btn, EmptyState, ErrorBanner, ReadableColumn } from "@/components/ui";
import { spacing } from "@/theme";

export const SignInPrompt = ({ what }: { what: string }) => {
  const sow = useGoogleSignIn();
  const appleAvailable = useAppleSignInAvailable();
  const signIn = async () => {
    if ((await sow.signInWithGoogle()) === "rejected") alertSowAccountRequired(appleAvailable);
  };
  return (
    <ReadableColumn>
      <EmptyState
        icon="lock-closed-outline"
        title={`Sign in to see this ${what}`}
        message="Use your SOW Google account. You'll come straight back here."
      />
      <View style={{ gap: spacing.sm, alignItems: "center" }}>
        <Btn
          title="Sign in with your SOW account"
          icon="logo-google"
          loading={sow.busy}
          onPress={() => void signIn()}
        />
        <ErrorBanner message={sow.error} />
      </View>
    </ReadableColumn>
  );
};
