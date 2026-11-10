import * as Crypto from "expo-crypto";
import { type CheckInDetails, parseCheckInDetails } from "../../shared/checkInMatch";
import { readStored, removeStored, writeStored } from "./deviceStorage";

const KEY_STORAGE = "checkInClientKey";
const DETAILS_STORAGE = "checkInDetails";

const randomKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Crypto.randomUUID();

export const loadDeviceKey = async (): Promise<string> => {
  const saved = await readStored(KEY_STORAGE);
  if (saved) return saved;
  const fresh = randomKey();
  await writeStored(KEY_STORAGE, fresh);
  return fresh;
};

export const loadCheckInDetails = async (): Promise<CheckInDetails | null> =>
  parseCheckInDetails(await readStored(DETAILS_STORAGE));

export const saveCheckInDetails = (details: CheckInDetails): Promise<void> =>
  writeStored(DETAILS_STORAGE, JSON.stringify(details));

export const forgetCheckInDetails = (): Promise<void> => removeStored(DETAILS_STORAGE);
