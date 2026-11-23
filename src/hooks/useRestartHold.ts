import { useEffect } from "react";
import { holdRestart } from "@/lib/restartHold";

export function useRestartHold(active: boolean): void {
  useEffect(() => (active ? holdRestart() : undefined), [active]);
}
