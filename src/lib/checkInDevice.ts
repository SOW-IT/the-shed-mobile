import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { type CheckInDetails, parseCheckInDetails } from "../../shared/checkInMatch";

const KEY_STORAGE = "checkInClientKey";
const DETAILS_STORAGE = "checkInDetails";

const onWeb = () => Platform.OS === "web" && typeof window !== "undefined";

const read = async (key: string): Promise<string | null> => {
  try {
    return onWeb() ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const write = async (key: string, value: string): Promise<void> => {
  try {
    if (onWeb()) window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    return;
  }
};

const remove = async (key: string): Promise<void> => {
  try {
    if (onWeb()) window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    return;
  }
};

const randomKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Crypto.randomUUID();

export const loadDeviceKey = async (): Promise<string> => {
  const saved = await read(KEY_STORAGE);
  if (saved) return saved;
  const fresh = randomKey();
  await write(KEY_STORAGE, fresh);
  return fresh;
};

export const loadCheckInDetails = async (): Promise<CheckInDetails | null> =>
  parseCheckInDetails(await read(DETAILS_STORAGE));

export const saveCheckInDetails = (details: CheckInDetails): Promise<void> =>
  write(DETAILS_STORAGE, JSON.stringify(details));

export const forgetCheckInDetails = (): Promise<void> => remove(DETAILS_STORAGE);
