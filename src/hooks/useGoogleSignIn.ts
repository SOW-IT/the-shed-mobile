import { useAuthActions } from "@convex-dev/auth/react";
import Constants from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

maybeCompleteAuthSession();

const REDIRECT_GRACE_MS = 2500;

export type GoogleProvider = "google" | "googlePersonal";

export type SignInOutcome = "signed-in" | "cancelled" | "rejected" | "error";

const PENDING_PROVIDER_KEY = "pendingGoogleAuthProvider";

const codeFromUrl = (url: string): string | null => {
  const fromExpo = Linking.parse(url).queryParams?.code;
  if (typeof fromExpo === "string") return fromExpo;
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
};

export const useWebAuthCodeExchange = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [rejectedProvider, setRejectedProvider] = useState<GoogleProvider | null>(
    null
  );
  const [busy, setBusy] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      !!new URLSearchParams(window.location.search).get("code")
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const pending = window.sessionStorage.getItem(
      PENDING_PROVIDER_KEY
    ) as GoogleProvider | null;
    if (!code) {
      if (pending) {
        window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        window.history.replaceState({}, "", window.location.pathname);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on load
        setRejectedProvider(pending);
      }
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
    const provider = pending || "google";
    window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
    setBusy(true);
    void signIn(provider, { code })
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  }, [signIn]);

  const clearError = useCallback(() => setError(null), []);
  const clearRejected = useCallback(() => setRejectedProvider(null), []);

  return { busy, error, rejectedProvider, clearError, clearRejected };
};

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export const useGoogleSignIn = (provider: GoogleProvider = "google") => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithGoogle = async (): Promise<SignInOutcome> => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        window.sessionStorage.setItem(PENDING_PROVIDER_KEY, provider);
        await signIn(provider, { redirectTo: window.location.origin });
        return "cancelled";
      }
      const scheme = Constants.expoConfig?.scheme ?? "theshedmobile";
      const redirectTo = makeRedirectUri({
        scheme: Array.isArray(scheme) ? scheme[0] : scheme,
      });
      const { redirect } = await signIn(provider, { redirectTo });
      if (!redirect) {
        setBusy(false);
        return "cancelled";
      }
      const outcome = await new Promise<{
        url: string | null;
        error?: unknown;
        rejected?: boolean;
      }>(
        (resolve) => {
          let settled = false;
          let graceTimer: ReturnType<typeof setTimeout> | null = null;
          let sessionError: unknown = null;
          let completedNoCode = false;
          const finishUrl = (url: string) => {
            if (settled) return;
            settled = true;
            if (graceTimer) clearTimeout(graceTimer);
            sub.remove();
            resolve({ url });
          };
          const finishWithoutCode = () => {
            if (settled) return;
            settled = true;
            sub.remove();
            resolve({ url: null, error: sessionError, rejected: completedNoCode });
          };
          const sub = Linking.addEventListener("url", (e) => {
            if (codeFromUrl(e.url)) finishUrl(e.url);
          });
          const startGrace = () => {
            if (settled || graceTimer) return;
            graceTimer = setTimeout(finishWithoutCode, REDIRECT_GRACE_MS);
          };
          void openAuthSessionAsync(redirect.toString(), redirectTo).then(
            (result) => {
              if (result.type === "success" && codeFromUrl(result.url)) {
                finishUrl(result.url);
              } else {
                if (result.type === "success") completedNoCode = true;
                startGrace();
              }
            },
            (e) => {
              sessionError = e;
              startGrace();
            }
          );
        }
      );
      const code = outcome.url ? codeFromUrl(outcome.url) : null;
      if (code) {
        await signIn(provider, { code });
        setBusy(false);
        return "signed-in";
      }
      if (outcome.error) throw outcome.error;
      setBusy(false);
      return outcome.rejected ? "rejected" : "cancelled";
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
      return "error";
    }
  };

  return { signInWithGoogle, busy, error, clearError: () => setError(null) };
};
