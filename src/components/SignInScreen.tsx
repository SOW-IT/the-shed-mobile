import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { makeRedirectUri } from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { useEffect, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "../theme";
import { Btn, Card, ErrorBanner, errorMessage, Muted, Screen, Txt } from "./ui";

export const SignInScreen = () => {
  const { signIn } = useAuthActions();
  const serverInfo = useQuery(api.directory.serverInfo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On web, Google redirects back to the app with ?code=XXX. ConvexAuthProvider
  // doesn't auto-exchange the code in Expo's web context, so we do it here.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Remove code from URL so a page refresh doesn't re-attempt a used code.
    window.history.replaceState({}, "", window.location.pathname);
    setBusy(true);
    void signIn("google", { code })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [signIn]);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        // Come back to wherever this app is served from (hosted site,
        // local dev, static preview) instead of defaulting to SITE_URL.
        await signIn("google", { redirectTo: window.location.origin });
        return; // full-page redirect to Google
      }
      const redirectTo = makeRedirectUri();
      const { redirect } = await signIn("google", { redirectTo });
      if (redirect) {
        const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
        if (result.type === "success") {
          const code = new URL(result.url).searchParams.get("code");
          if (code) await signIn("google", { code });
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const t = useAppTheme();

  return (
    <Screen>
      <View style={styles.hero}>
        <Image
          source={
            t.dark
              ? require("../../assets/images/lockup-cream.png")
              : require("../../assets/images/lockup-dark.png")
          }
          style={styles.lockup}
          resizeMode="contain"
        />
        <Txt style={styles.title}>THE SHED</Txt>
        <Muted>Reimbursement requests</Muted>
      </View>
      <Card>
        <Btn
          title={busy ? "Signing in…" : "Sign in with Google"}
          onPress={handleSignIn}
          disabled={busy}
        />
        <Muted>
          Use your {serverInfo?.allowedDomain ?? "organisation"} Google account.
        </Muted>
        <ErrorBanner message={error} />
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginVertical: 32, gap: 4 },
  lockup: { width: 280, height: 53, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: 1 },
});
