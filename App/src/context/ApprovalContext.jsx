import { useCallback, useMemo, useState } from "react";
import ApprovalDialog from "../components/ApprovalDialog";
import { useAuth } from "./AuthContext";
import { ApprovalContext } from "./approval-context";

export function ApprovalProvider({ children }) {
  const { hasPermission } = useAuth();
  const [pending, setPending] = useState(null);

  const runWithApproval = useCallback((details, execute) => {
    if (hasPermission(details.permission)) return execute();
    return new Promise((resolve, reject) => {
      setPending({ ...details, execute, resolve, reject });
    });
  }, [hasPermission]);

  const close = useCallback(() => {
    if (pending) {
      const error = new Error("Approval cancelled.");
      error.approvalCancelled = true;
      pending.reject(error);
    }
    setPending(null);
  }, [pending]);

  const approved = useCallback(async (token) => {
    const current = pending;
    if (!current) return;
    const result = await current.execute(token);
    current.resolve(result);
    setPending(null);
  }, [pending]);

  const value = useMemo(() => ({ runWithApproval }), [runWithApproval]);
  return <ApprovalContext.Provider value={value}>
    {children}
    {pending && <ApprovalDialog
      open={Boolean(pending)}
      action={pending?.action}
      actionLabel={pending?.actionLabel}
      targetId={pending?.targetId}
      targetLabel={pending?.targetLabel}
      amountLabel={pending?.amountLabel}
      payload={pending?.payload}
      initialReason={pending?.initialReason}
      onClose={close}
      onApproved={approved}
    />}
  </ApprovalContext.Provider>;
}
