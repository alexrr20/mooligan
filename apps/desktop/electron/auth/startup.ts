import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { App, Protocol } from "electron";

import { AUTH_PROTOCOL, isAuthCallbackUrl } from "./service.ts";

type StartupApp = Pick<App, "on" | "requestSingleInstanceLock" | "setAsDefaultProtocolClient">;

export interface AuthColdStart {
  isPrimary: boolean;
  protocolRegistered: boolean;
  start(
    handler: (url: string) => Promise<unknown>,
    onError?: (error: unknown) => void,
  ): Promise<void>;
}

export function registerAuthScheme(protocol: Pick<Protocol, "registerSchemesAsPrivileged">) {
  protocol.registerSchemesAsPrivileged([
    {
      privileges: { secure: true, standard: false },
      scheme: AUTH_PROTOCOL,
    },
  ]);
}

export function registerAuthColdStart(
  app: StartupApp,
  argv: readonly string[] = process.argv,
): AuthColdStart {
  const callbacks = argv.filter(isAuthCallbackUrl);
  const queue = new CallbackQueue();

  for (const callback of callbacks) {
    queue.add(callback);
  }

  app.on("open-url", (event, url) => {
    event.preventDefault();
    queue.add(url);
  });

  const initialCallback = callbacks.at(-1);
  const isPrimary = app.requestSingleInstanceLock(
    initialCallback ? { authCallback: initialCallback } : undefined,
  );

  app.on("second-instance", (_event, commandLine, _workingDirectory, additionalData) => {
    if (isRecord(additionalData)) {
      queue.add(additionalData.authCallback);
    }
    for (const argument of commandLine) {
      queue.add(argument);
    }
  });

  return {
    isPrimary,
    protocolRegistered: registerProtocolClient(app, argv),
    start: (handler, onError) => queue.start(handler, onError),
  };
}

class CallbackQueue {
  readonly #pending: string[] = [];
  readonly #seen = new Set<string>();
  #handler: ((url: string) => Promise<unknown>) | undefined;
  #onError: ((error: unknown) => void) | undefined;
  #tail = Promise.resolve();

  add(value: unknown) {
    if (!isAuthCallbackUrl(value)) {
      return;
    }

    const fingerprint = createHash("sha256").update(value).digest("base64url");
    if (this.#seen.has(fingerprint)) {
      return;
    }
    this.#seen.add(fingerprint);

    if (this.#handler) {
      this.#schedule(value);
    } else {
      this.#pending.push(value);
    }
  }

  start(handler: (url: string) => Promise<unknown>, onError?: (error: unknown) => void) {
    if (this.#handler) {
      throw new Error("Authentication callback handling has already started.");
    }

    this.#handler = handler;
    this.#onError = onError;

    for (const url of this.#pending.splice(0)) {
      this.#schedule(url);
    }

    return this.#tail;
  }

  #schedule(url: string) {
    this.#tail = this.#tail
      .then(() => this.#handler?.(url))
      .then(() => undefined)
      .catch((error: unknown) => {
        try {
          this.#onError?.(error);
        } catch {
          // Callback reporting must not stop later OS deliveries.
        }
      });
  }
}

function registerProtocolClient(app: StartupApp, argv: readonly string[]) {
  const electronProcess = process as NodeJS.Process & { defaultApp?: boolean };

  if (electronProcess.defaultApp && argv[1]) {
    return app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [resolve(argv[1])]);
  }

  return app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
