import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { APPLE_ORG_EMAIL_REJECTION } from "../../convex/appleIdentity";
import type { SignInOutcome } from "./useGoogleSignIn";

const CANCEL_CODE = "ERR_REQUEST_CANCELED";

const isCancel = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  (e as { code?: unknown }).code === CANCEL_CODE;

const isOrgEmailRejection = (e: unknown): boolean =>
  e instanceof ConvexError &&
  (e.data as { kind?: unknown } | undefined)?.kind ===
    APPLE_ORG_EMAIL_REJECTION;

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

const formatFullName = (
  name: AppleAuthentication.AppleAuthenticationFullName | null
): string | null => {
  if (!name) return null;
  const full = [name.givenName, name.familyName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ")
    .trim();
  return full.length > 0 ? full : null;
};

export const useAppleSignInAvailable = (): boolean => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
};

export const useAppleSignIn = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithApple = async (): Promise<SignInOutcome> => {
    setError(null);
    setBusy(true);
    try {
      const rawNonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: rawNonce,
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }
      const fullName = formatFullName(credential.fullName);
      await signIn("apple", {
        identityToken: credential.identityToken,
        rawNonce,
        ...(fullName ? { fullName } : {}),
      });
      setBusy(false);
      return "signed-in";
    } catch (e) {
      setBusy(false);
      if (isCancel(e)) return "cancelled";
      if (isOrgEmailRejection(e)) return "rejected";
      setError(errorText(e));
      return "error";
    }
  };

  return { signInWithApple, busy, error, clearError: () => setError(null) };
};
