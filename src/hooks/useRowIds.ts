import { useState } from "react";
import { rowIdsFor, rowKey, withRowAdded, withRowRemoved } from "@/lib/listKeys";

/**
 * Stable keys for an editable list whose rows have no id. Call `add` and
 * `remove` alongside the change to the list itself.
 */
export const useRowIds = (count: number) => {
  const [rows, setRows] = useState(() => rowIdsFor(count));
  return {
    keyAt: (index: number) => rowKey(rows, index),
    add: () => setRows(withRowAdded),
    remove: (index: number) => setRows((current) => withRowRemoved(current, index)),
  };
};
