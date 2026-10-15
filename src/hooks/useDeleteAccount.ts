import { useAuthActions } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import { useState } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import { errorMessage } from "@/components/ui";

const APPLE_CANCEL_CODE = "ERR_REQUEST_CANCELED";

type AppleProof = { authorizationCode: string; clientId: string };

const appleProof = async (): Promise<AppleProof | "cancelled" | null> => {
  const clientId = Constants.expoConfig?.ios?.bundleIdentifier;
  if (Platform.OS !== "ios" || !clientId || !(await AppleAuthentication.isAvailableAsync())) {
    return null;
  }
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    return credential.authorizationCode
      ? { authorizationCode: credential.authorizationCode, clientId }
      : null;
  } catch (e) {
    if ((e as { code?: unknown } | null)?.code === APPLE_CANCEL_CODE) return "cancelled";
    throw e;
  }
};

export const useDeleteAccount = () => {
  const deleteMine = useAction(api.account.deleteMine);
  const { signOut } = useAuthActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = async (
    kind: "sow" | "apple",
    confirmName: string
  ): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      const apple = kind === "apple" ? await appleProof() : null;
      if (apple === "cancelled") return false;
      await deleteMine({ confirmName, ...(apple ? { apple } : {}) });
      await signOut();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { deleteAccount, busy, error };
};
