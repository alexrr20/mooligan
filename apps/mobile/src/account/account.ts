import { nativeApplicationVersion } from "expo-application";

import { accountConfiguration } from "./config";
import { MobileAccount } from "./mobile-account";
import { createMobileAuthClient } from "./auth-client";
import { openWorkspaceRegistry } from "./workspace-registry";
import { observeConnection, openWorkspaceStore } from "./workspace-store";

function createMobileAccount() {
  const registry = openWorkspaceRegistry();
  let configuration: ReturnType<typeof accountConfiguration> = null;
  let configurationError: string | null = null;
  try {
    configuration = accountConfiguration(
      process.env.EXPO_PUBLIC_MOOLIGAN_AUTH_ORIGIN ?? "https://mooligan-api.bessa.workers.dev",
    );
  } catch {
    configurationError =
      "The Account service address in this build is invalid. Your Workspace is available locally.";
  }

  const account = new MobileAccount(
    configuration
      ? () => createMobileAuthClient(configuration.authOrigin, registry.bootstrap().clientId)
      : null,
    registry,
    async (runtime) => {
      const store = await openWorkspaceStore(runtime, configuration?.syncUrl ?? null);
      return {
        store,
        close: () => store.shutdownPromise(),
        observeConnection: (changed: (connected: boolean) => void) =>
          observeConnection(store, changed),
      };
    },
    nativeApplicationVersion ?? "0.0.0",
    configuration?.authOrigin ?? null,
  );
  if (configurationError) account.reportError(configurationError);
  return account;
}

let account: ReturnType<typeof createMobileAccount> | undefined;
export function getMobileAccount() {
  return (account ??= createMobileAccount());
}
