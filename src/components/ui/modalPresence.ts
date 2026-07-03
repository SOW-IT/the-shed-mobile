// Tracks whether any full-screen modal (Sheet / OptionSheet) is currently
// presented, so a pinned FooterAction on the screen *behind* the modal can opt
// out of following the software keyboard.
//
// Why this exists: keyboard show/hide events are app-global. When a modal opens
// its own text field (e.g. the comments composer), the FooterAction sitting on
// the base screen — occluded by the modal's dimmed backdrop — would otherwise
// lift with the keyboard and "shoot up" into view behind the modal. The keyboard
// belongs to the modal; the modal handles its own avoidance (KeyboardAvoidingView)
// and the footer should simply stay put.

import { useEffect, useState } from "react";

let openCount = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * Count this component as an open modal for as long as `visible` is true.
 * Call from every modal primitive that can host a keyboard.
 */
export const useRegisterModal = (visible: boolean) => {
  useEffect(() => {
    if (!visible) return;
    openCount += 1;
    emit();
    return () => {
      openCount -= 1;
      emit();
    };
  }, [visible]);
};

/** Reactively read whether any modal is currently open. */
export const useAnyModalOpen = (): boolean => {
  const [open, setOpen] = useState(() => openCount > 0);
  useEffect(() => {
    const update = () => setOpen(openCount > 0);
    listeners.add(update);
    // Sync in case the count changed between render and subscribe.
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return open;
};
