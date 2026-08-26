import { useEffect, useSyncExternalStore } from "react";

let openCount = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

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

export const useAnyModalOpen = (): boolean =>
  useSyncExternalStore(subscribe, () => openCount > 0);
