import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";

import { getMobileAccount } from "./account";

export function AccountStartup({ children }: { children: ReactNode }) {
  const account = getMobileAccount();
  useEffect(() => {
    void account.initialize();
    const subscription = AppState.addEventListener("change", (state) => {
      account.setActive(state === "active");
    });
    return () => {
      subscription.remove();
      account.setActive(false);
    };
  }, [account]);
  return children;
}

export function useMobileAccount() {
  const account = getMobileAccount();
  const snapshot = useSyncExternalStore(account.subscribe, account.getSnapshot);
  return { account, ...snapshot };
}
