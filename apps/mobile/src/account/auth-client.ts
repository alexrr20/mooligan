import { expoClient } from "@better-auth/expo/client";
import type { BetterFetch, ClientStore } from "better-auth/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

type ExpoPlugin = Omit<ReturnType<typeof expoClient>, "getActions"> & {
  getActions(
    fetch: BetterFetch,
    store: ClientStore,
  ): ReturnType<ReturnType<typeof expoClient>["getActions"]>;
};

export function createMobileAuthClient(baseURL: string, deviceId: string) {
  const serviceKey = Array.from(new TextEncoder().encode(baseURL), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return createAuthClient({
    baseURL,
    fetchOptions: { timeout: 10_000 },
    plugins: [
      // SAFETY: 1.6.25 expands BetterFetch's default generics in its declarations.
      // Its getActions implementation matches the client contract and ignores
      // the fetch argument. Preserve the Expo actions while normalizing that type.
      expoClient({
        scheme: "com.mooligan.app",
        // Isolate sessions across installations and service environments.
        storagePrefix: `mooligan.${deviceId}.${serviceKey}`,
        storage: SecureStore,
      }) as ExpoPlugin,
    ],
  });
}

export type MobileAuthClient = Pick<
  ReturnType<typeof createMobileAuthClient>,
  "getSession" | "signIn" | "signOut" | "getCookie" | "$store"
>;
