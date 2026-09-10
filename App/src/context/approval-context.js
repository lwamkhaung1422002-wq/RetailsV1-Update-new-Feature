import { createContext, useContext } from "react";

export const ApprovalContext = createContext({
  runWithApproval: (_details, execute) => execute(),
});

export function useManagerApproval() {
  return useContext(ApprovalContext);
}
