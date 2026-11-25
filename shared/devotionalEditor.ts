import type { DevotionalSharingLevel } from "./devotionalGroups";
import {
  EMPTY_DEVOTIONAL,
  sameDevotionalContent,
  type DevotionalContent,
  type LocalDevotionalDraft,
} from "./devotionals";

export const DEVOTIONAL_CONFLICT_TEXT = "This day was changed on another device. Choose which version to keep.";
export const DEVOTIONAL_SAVED_ON_DEVICE_TEXT = "Saved on this device.";
export const DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT = "Couldn't save on this device. Try again.";
export const DEVOTIONAL_SHARING_FAILED_TEXT = "Couldn't update sharing. Try again.";
export const DEVOTIONAL_SHARING_OFFLINE_TEXT = "Connect to the internet to save what you share, or change it back.";

export const savedSharingLevel = (
  personalLevel: DevotionalSharingLevel | null | undefined,
  defaultGroupLevel: DevotionalSharingLevel | null | undefined
): DevotionalSharingLevel => personalLevel ?? defaultGroupLevel ?? "everything";

export const pendingSharingLevel = (
  chosen: DevotionalSharingLevel | null,
  saved: DevotionalSharingLevel | null
): DevotionalSharingLevel | null => (chosen !== null && saved !== null && chosen !== saved ? chosen : null);

export const devotionalContentChanged = (
  localDraft: LocalDevotionalDraft | undefined,
  remote: DevotionalContent | null | undefined
): boolean => {
  if (!localDraft?.dirty) return false;
  if (localDraft.conflict || remote === undefined) return true;
  return !sameDevotionalContent(localDraft, remote ?? EMPTY_DEVOTIONAL);
};

export const devotionalEditorDirty = (input: {
  localDraft: LocalDevotionalDraft | undefined;
  remote: DevotionalContent | null | undefined;
  pendingSharing: DevotionalSharingLevel | null;
}): boolean => input.pendingSharing !== null || devotionalContentChanged(input.localDraft, input.remote);

export type DevotionalSaveOutcome =
  | { kind: "saved" }
  | { kind: "unchanged" }
  | { kind: "savedOnDevice" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

type DevotionalSaveFeedback =
  | { toast: string; error: null }
  | { toast: null; error: string | null };

export const devotionalSaveFeedback = (outcome: DevotionalSaveOutcome): DevotionalSaveFeedback => {
  switch (outcome.kind) {
    case "saved":
    case "unchanged":
      return { toast: "Saved", error: null };
    case "savedOnDevice":
      return { toast: DEVOTIONAL_SAVED_ON_DEVICE_TEXT, error: null };
    case "conflict":
      return { toast: null, error: DEVOTIONAL_CONFLICT_TEXT };
    case "error":
      return { toast: null, error: outcome.message };
  }
};
