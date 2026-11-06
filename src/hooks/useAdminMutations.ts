import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";

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
  addPraiseManager: useMutation(api.admin.addPraiseManager),
  removePraiseManager: useMutation(api.admin.removePraiseManager),
  setDirectorThreshold: useMutation(api.admin.setDirectorThreshold),
  setEventDirectorThreshold: useMutation(api.admin.setEventDirectorThreshold),
  addDelegation: useMutation(api.admin.addDelegation),
  removeDelegation: useMutation(api.admin.removeDelegation),
});
