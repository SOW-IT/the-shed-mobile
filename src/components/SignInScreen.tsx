import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { makeRedirectUri } from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { useAppTheme } from "../theme";
import { Btn, Card, ErrorBanner, errorMessage, Muted, Screen, Txt } from "./ui";

export const SignInScreen = () => {
  const { signIn } = useAuthActions();
  const info = useQuery(api.directory.serverInfo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <View style={styles.logoWrap}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
          />
        </View>
        <Txt style={styles.title}>THE SHED</Txt>
        <Muted>Reimbursement requests</Muted>
      </View>
      <Card>
        <Btn
          title={busy ? "Signing in…" : "Sign in with Google"}
          onPress={handleSignIn}
          disabled={busy}
        />
        <Muted>Use your sow.org.au Google account.</Muted>
        <ErrorBanner message={error} />
      </Card>
      <Card>
        {info === undefined ? (
          <Muted>Connecting to Convex…</Muted>
        ) : (
          <>
            <Text style={[styles.connected, { color: t.success }]}>
              ✓ Connected to Convex
            </Text>
            <Muted>
              Staff year {info.staffYear} (next: {info.nextStaffYear})
            </Muted>
            <Muted>
              {info.departments.length} departments in {info.divisions.length}{" "}
              divisions:{" "}
              {info.departments.map((department) => department.name).join(", ")}
            </Muted>
          </>
        )}
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginVertical: 32, gap: 4 },
  // White disc so the black logo mark reads in dark mode too.
  logoWrap: {
    backgroundColor: "#ffffff",
    borderRadius: 48,
    padding: 8,
    marginBottom: 8,
  },
  logo: { width: 80, height: 80 },
  title: { fontSize: 32, fontWeight: "900", letterSpacing: 1 },
  connected: { fontWeight: "700" },
});
