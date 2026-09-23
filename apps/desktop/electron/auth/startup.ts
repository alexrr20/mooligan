import { createHash } from "node:crypto";
import { resolve } from "node:path";

import type { Event } from "electron";
import { type JsonValue, JsonValueSchema } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

import { AUTH_PROTOCOL, isAuthCallbackUrl } from "./service.ts";

type AuthLaunchData = { authCallback?: string };

const decodeLaunchData = Schema.decodeUnknownOption(
  Schema.Struct({ authCallback: Schema.optional(JsonValueSchema) }),
);
const decodeElectronProcess = Schema.decodeUnknownSync(
  Schema.Struct({ defaultApp: Schema.optional(Schema.Boolean) }),
);

export interface StartupApp {
  onOpenUrl(listener: (event: Event, url: string) => void): void;
  onSecondInstance(
    listener: (
      event: Event,
      commandLine: string[],
      workingDirectory: string,
      additionalData: JsonValue,
    ) => void,
  ): void;
  requestSingleInstanceLock(additionalData?: AuthLaunchData): boolean;
  setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
}

export interface AuthColdStart {
  isPrimary: boolean;
  protocolRegistered: boolean;
  start(handler: (url: string) => Promise<void>, onError?: (cause: unknown) => void): Promise<void>;
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

  app.onOpenUrl((event, url) => {
    event.preventDefault();
    queue.add(url);
  });

  const initialCallback = callbacks.at(-1);
  const isPrimary = app.requestSingleInstanceLock(
    initialCallback ? { authCallback: initialCallback } : undefined,
  );

  app.onSecondInstance((_event, commandLine, _workingDirectory, additionalData) => {
    const data = decodeLaunchData(additionalData);
    if (Option.isSome(data) && data.value.authCallback !== undefined) {
      queue.add(data.value.authCallback);
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
  #handler: ((url: string) => Promise<void>) | undefined;
  #onError: ((cause: unknown) => void) | undefined;
  #tail = Promise.resolve();

  add(value: JsonValue) {
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

  start(handler: (url: string) => Promise<void>, onError?: (cause: unknown) => void) {
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
      .catch((cause: unknown) => {
        try {
          this.#onError?.(cause);
        } catch {
          // Callback reporting must not stop later OS deliveries.
        }
      });
  }
}

function registerProtocolClient(app: StartupApp, argv: readonly string[]) {
  const electronProcess = decodeElectronProcess(process);

  if (electronProcess.defaultApp && argv[1]) {
    return app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [resolve(argv[1])]);
  }

  return app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}
