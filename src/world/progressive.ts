import { useEffect, useState } from "react";

export const nextShown = (shown: number, total: number, batch: number) => Math.min(total, shown + Math.max(1, batch));

export const useProgressive = (total: number, first: number, batch: number) => {
  const [shown, setShown] = useState(() => Math.min(total, first));
  useEffect(() => {
    if (shown >= total) return;
    const frame = requestAnimationFrame(() => setShown((n) => nextShown(n, total, batch)));
    return () => cancelAnimationFrame(frame);
  }, [shown, total, batch]);
  return Math.min(shown, total);
};
