import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router";
import { useApiResource } from "../../hooks/useApiResource";
import { DEFAULT_ROLE_PERMISSIONS, samePermissions } from "./staffAccessModel";

export function useStagedPermissions(api, initialBranchId) {
  const [branchId, setBranchId] = useState(initialBranchId || "");
  const [role, setRole] = useState("MANAGER");
  const [savedPermissions, setSavedPermissions] = useState([]);
  const [draftPermissions, setDraftPermissions] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const loadPolicies = useCallback(async () => {
    if (!branchId) return { policies: [], branchId: "" };
    const result = await api.staff.policies(branchId);
    const policy = (result.policies || []).find((entry) => entry.role === role);
    const permissions = [...(policy?.permissions || [])];
    setSavedPermissions(permissions);
    setDraftPermissions(permissions);
    setSaveError("");
    return { ...result, branchId };
  }, [api, branchId, role]);
  const resource = useApiResource(loadPolicies);
  const reloadPolicies = resource.reload;

  const dirty = useMemo(() => !samePermissions(savedPermissions, draftPermissions), [draftPermissions, savedPermissions]);
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const requestAction = useCallback((action) => {
    if (dirty) setPendingAction(() => action);
    else action();
  }, [dirty]);

  const selectBranch = useCallback((nextBranchId) => requestAction(() => setBranchId(nextBranchId)), [requestAction]);
  const selectRole = useCallback((nextRole) => requestAction(() => setRole(nextRole)), [requestAction]);
  const togglePermission = useCallback((permission, enabled) => {
    setSaveError("");
    setDraftPermissions((current) => enabled
      ? [...new Set([...current, permission])]
      : current.filter((entry) => entry !== permission));
  }, []);
  const cancel = useCallback(() => {
    setDraftPermissions([...savedPermissions]);
    setSaveError("");
  }, [savedPermissions]);
  const resetToDefault = useCallback(() => {
    setDraftPermissions([...(DEFAULT_ROLE_PERMISSIONS[role] || [])]);
    setSaveError("");
  }, [role]);
  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await api.staff.updatePolicy(role, draftPermissions, branchId);
      const permissions = [...(result.policy?.permissions || draftPermissions)];
      setSavedPermissions(permissions);
      setDraftPermissions(permissions);
      await reloadPolicies();
    } catch (error) {
      setSaveError(error.message || "Unable to save permission changes.");
    } finally {
      setSaving(false);
    }
  }, [api, branchId, dirty, draftPermissions, reloadPolicies, role, saving]);

  const discardAndContinue = useCallback(() => {
    setDraftPermissions([...savedPermissions]);
    setSaveError("");
    if (blocker.state === "blocked") blocker.proceed();
    else if (pendingAction) pendingAction();
    setPendingAction(null);
  }, [blocker, pendingAction, savedPermissions]);
  const keepEditing = useCallback(() => {
    if (blocker.state === "blocked") blocker.reset();
    setPendingAction(null);
  }, [blocker]);

  return {
    branchId,
    role,
    savedPermissions,
    draftPermissions,
    dirty,
    saving,
    saveError,
    resource,
    selectBranch,
    selectRole,
    togglePermission,
    cancel,
    resetToDefault,
    save,
    requestAction,
    confirmationOpen: Boolean(pendingAction) || blocker.state === "blocked",
    discardAndContinue,
    keepEditing,
  };
}
