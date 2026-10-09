import { memo } from "react";
import { AttendanceRow, type AttendanceRowMode } from "@/components/AttendanceRow";

/** What a roll-call row does, by row key. One stable object for the whole
 *  list, so a sign-in elsewhere doesn't re-render every row. */
export type RollCallHandlers = {
  actionStart: (mode: AttendanceRowMode, key: string) => void;
  action: (mode: AttendanceRowMode, key: string) => void;
  edit: (mode: AttendanceRowMode, key: string) => void;
  exited: (mode: AttendanceRowMode, key: string) => void;
};

type RollCallRowProps = {
  rowKey: string;
  mode: AttendanceRowMode;
  name: string;
  subtitle?: string;
  photo?: string | null;
  university?: string;
  roles: string[];
  disabled: boolean;
  dimmed: boolean;
  entering: boolean;
  exiting: boolean;
  /** Swiping (or tapping) the action is allowed. */
  actionable: boolean;
  editable: boolean;
  handlers: RollCallHandlers;
};

function RollCallRowBase({
  rowKey,
  mode,
  roles,
  actionable,
  editable,
  handlers,
  ...row
}: RollCallRowProps) {
  return (
    <AttendanceRow
      {...row}
      roles={roles}
      mode={mode}
      onActionStart={actionable ? () => handlers.actionStart(mode, rowKey) : undefined}
      onAction={() => handlers.action(mode, rowKey)}
      onEdit={editable ? () => handlers.edit(mode, rowKey) : undefined}
      onExited={row.exiting ? () => handlers.exited(mode, rowKey) : undefined}
    />
  );
}

const sameRoles = (a: string[], b: string[]) =>
  a.length === b.length && a.every((role, i) => role === b[i]);

/** Query results come back as new objects every time, so roles are compared
 *  by value; everything else is a primitive or the stable handlers. */
export const RollCallRow = memo(
  RollCallRowBase,
  (prev, next) =>
    (Object.keys(next) as (keyof RollCallRowProps)[]).every((k) =>
      k === "roles" ? sameRoles(prev.roles, next.roles) : prev[k] === next[k]
    )
);
