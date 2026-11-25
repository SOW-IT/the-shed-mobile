import { describe, expect, test } from "vitest";
import {
  DEVOTIONAL_CONFLICT_TEXT,
  DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT,
  DEVOTIONAL_SAVED_ON_DEVICE_TEXT,
  devotionalContentChanged,
  devotionalEditorDirty,
  devotionalSaveFeedback,
  pendingSharingLevel,
  savedSharingLevel,
} from "./devotionalEditor";
import type { LocalDevotionalDraft } from "./devotionals";

const saved = { passage: "John 15:1-17", notes: "Abide.", prayerPoints: "Stay close." };

const draft = (overrides: Partial<LocalDevotionalDraft> = {}): LocalDevotionalDraft => ({
  date: "2026-11-25",
  updatedAt: 1,
  base: 1,
  conflict: false,
  dirty: true,
  ...saved,
  ...overrides,
});

describe("devotional editor dirty check", () => {
  test("nothing changed when there is no unsynced draft", () => {
    expect(devotionalContentChanged(undefined, saved)).toBe(false);
    expect(devotionalContentChanged(draft({ dirty: false, notes: "Older" }), saved)).toBe(false);
    expect(devotionalEditorDirty({ localDraft: undefined, remote: saved, pendingSharing: null })).toBe(false);
  });

  test("each of passage, notes and prayer counts as a change", () => {
    expect(devotionalContentChanged(draft({ passage: "Psalm 23" }), saved)).toBe(true);
    expect(devotionalContentChanged(draft({ notes: "Abide in me." }), saved)).toBe(true);
    expect(devotionalContentChanged(draft({ prayerPoints: "" }), saved)).toBe(true);
  });

  test("typing and undoing back to the saved text is not a change", () => {
    expect(devotionalContentChanged(draft(), saved)).toBe(false);
    expect(
      devotionalContentChanged(draft({ passage: "", notes: "", prayerPoints: "" }), null)
    ).toBe(false);
    expect(devotionalContentChanged(draft({ notes: "New day" }), null)).toBe(true);
  });

  test("an unsynced draft counts while offline or in conflict", () => {
    expect(devotionalContentChanged(draft(), undefined)).toBe(true);
    expect(devotionalContentChanged(draft({ conflict: true }), saved)).toBe(true);
  });

  test("a new sharing choice makes the editor dirty on its own", () => {
    expect(devotionalEditorDirty({ localDraft: undefined, remote: saved, pendingSharing: "count" })).toBe(true);
    expect(
      devotionalEditorDirty({ localDraft: draft({ notes: "Changed" }), remote: saved, pendingSharing: null })
    ).toBe(true);
  });
});

describe("devotional editor sharing control", () => {
  test("shows the person's level, then the group's, then Everything", () => {
    expect(savedSharingLevel("count", "everything")).toBe("count");
    expect(savedSharingLevel(null, "passage")).toBe("passage");
    expect(savedSharingLevel(undefined, null)).toBe("everything");
  });

  test("only a choice that differs from the saved level is pending", () => {
    expect(pendingSharingLevel(null, "passage")).toBeNull();
    expect(pendingSharingLevel("passage", "passage")).toBeNull();
    expect(pendingSharingLevel("count", null)).toBeNull();
    expect(pendingSharingLevel("count", "passage")).toBe("count");
  });
});

describe("devotional editor save feedback", () => {
  test("a successful save shows a Saved toast and clears any error", () => {
    expect(devotionalSaveFeedback({ kind: "saved" })).toEqual({ toast: "Saved", error: null });
    expect(devotionalSaveFeedback({ kind: "unchanged" })).toEqual({ toast: "Saved", error: null });
    expect(devotionalSaveFeedback({ kind: "savedOnDevice" })).toEqual({
      toast: DEVOTIONAL_SAVED_ON_DEVICE_TEXT,
      error: null,
    });
  });

  test("failures become a lasting error instead of a toast", () => {
    expect(devotionalSaveFeedback({ kind: "conflict" })).toEqual({ toast: null, error: DEVOTIONAL_CONFLICT_TEXT });
    expect(
      devotionalSaveFeedback({ kind: "error", message: DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT })
    ).toEqual({ toast: null, error: DEVOTIONAL_DEVICE_SAVE_FAILED_TEXT });
  });
});
