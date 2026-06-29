import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Bundles the admin screen's ~20 `api.admin.*` mutation handles into one typed
 * object so `AdminScreen` doesn't open with twenty near-identical `useMutation`
 * lines. Destructure exactly what each call site needs:
 *
 *   const { setStaffProfile, upsertDivision } = useAdminMutations();
 */
export const useAdminMutations = () => ({
  setStaffProfile: useMutation(api.admin.setStaffProfile),
  removeStaffProfile: useMutation(api.admin.removeStaffProfile),
  markLeaving: useMutation(api.admin.markLeaving),
  unmarkLeaving: useMutation(api.admin.unmarkLeaving),
  upsertDivision: useMutation(api.admin.upsertDivision),
  updateDivision: useMutation(api.admin.updateDivision),
  removeDivision: useMutation(api.admin.removeDivision),
  upsertDepartment: useMutation(api.admin.upsertDepartment),
  updateDepartment: useMutation(api.admin.updateDepartment),
  removeDepartment: useMutation(api.admin.removeDepartment),
  upsertUniversity: useMutation(api.admin.upsertUniversity),
  updateUniversity: useMutation(api.admin.updateUniversity),
  removeUniversity: useMutation(api.admin.removeUniversity),
  upsertRole: useMutation(api.admin.upsertRole),
  updateRole: useMutation(api.admin.updateRole),
  removeRole: useMutation(api.admin.removeRole),
  setBudgetManager: useMutation(api.admin.setBudgetManager),
  setDirectorThreshold: useMutation(api.admin.setDirectorThreshold),
  addDelegation: useMutation(api.admin.addDelegation),
  removeDelegation: useMutation(api.admin.removeDelegation),
});
