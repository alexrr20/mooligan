import { ipcMain } from "electron";

import { assertTrustedSender } from "../ipc-security";
import { focusFirstWindow, publishRendererEvent } from "../windows";
import type { DesktopAuth } from "./service";
import type { AuthColdStart } from "./startup";

type AuthChanged = (snapshot: ReturnType<DesktopAuth["snapshot"]>) => Promise<void> | void;

export async function registerAuthIpc(
  auth: DesktopAuth,
  startup: AuthColdStart,
  authChanged: AuthChanged = () => undefined,
) {
  let lastError: string | null = null;

  function applySnapshot(snapshot: ReturnType<DesktopAuth["snapshot"]>) {
    lastError = null;
    publishRendererEvent("auth:changed", snapshot);
    return snapshot;
  }

  async function run(operation: () => ReturnType<DesktopAuth["refresh"]>) {
    try {
      const snapshot = await operation();
      await authChanged(snapshot);
      return applySnapshot(snapshot);
    } catch (error) {
      applySnapshot(auth.snapshot());
      throw new Error(publicAuthError(error));
    }
  }

  function reportError(cause: unknown) {
    lastError = publicAuthError(cause);
    publishRendererEvent("auth:error", lastError);
  }

  const restored = await auth.restore();
  try {
    await authChanged(restored);
    applySnapshot(restored);
  } catch (cause) {
    applySnapshot(auth.snapshot());
    reportError(cause);
  }

  ipcMain.handle("auth:read", (event) => {
    assertTrustedSender(event);
    return auth.snapshot();
  });
  ipcMain.handle("auth:sign-in", (event) => {
    assertTrustedSender(event);
    return run(() => auth.beginSignIn());
  });
  ipcMain.handle("auth:refresh", (event) => {
    assertTrustedSender(event);
    return run(() => auth.refresh());
  });
  ipcMain.handle("auth:sign-out", (event) => {
    assertTrustedSender(event);
    return run(() => auth.signOut());
  });

  void startup.start(async (url) => {
    await run(() => auth.handleCallback(url));
    focusFirstWindow();
  }, reportError);

  return function publishAuthStateAndRefresh() {
    publishRendererEvent("auth:changed", auth.snapshot());
    if (lastError) {
      publishRendererEvent("auth:error", lastError);
    }

    void auth
      .refresh()
      .then(async (snapshot) => {
        await authChanged(snapshot);
        applySnapshot(snapshot);
      })
      .catch((cause: unknown) => {
        applySnapshot(auth.snapshot());
        reportError(cause);
      });
  };
}

function publicAuthError(cause: unknown) {
  if (
    cause instanceof Error &&
    ["AuthInputError", "AuthRequestError", "ProtectedStorageError"].includes(cause.name)
  ) {
    return cause.message;
  }

  return "Account sign-in could not be completed. Return to Settings and try again.";
}
