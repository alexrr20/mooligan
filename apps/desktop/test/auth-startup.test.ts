import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import type { Protocol } from "electron";

import { registerAuthColdStart, type StartupApp } from "../electron/auth/startup.ts";
import { registerDesktopSchemes } from "../electron/protocols.ts";
import { AUTH_PROTOCOL } from "../electron/auth/service.ts";

void test("cold-start callbacks queue before readiness and duplicate OS delivery is harmless", async () => {
  const state = "S".repeat(43);
  const initial = callback("A".repeat(32), state);
  const later = callback("B".repeat(32), state);
  const app = new FakeApp();
  const coldStart = registerAuthColdStart(app, ["mooligan", initial]);
  let prevented = false;

  app.emit(
    "open-url",
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    initial,
  );
  app.emit("second-instance", {}, ["mooligan", later], "", { authCallback: later });
  app.emit("second-instance", {}, ["mooligan", "https://attacker.example/callback"], "", {});

  const handled: string[] = [];
  await coldStart.start(async (url) => {
    handled.push(url);
  });

  assert.equal(prevented, true);
  assert.equal(coldStart.isPrimary, true);
  assert.equal(coldStart.protocolRegistered, true);
  assert.deepEqual(app.lockData, { authCallback: initial });
  assert.deepEqual(handled, [initial, later]);
  assert.deepEqual(app.protocolRegistration, [AUTH_PROTOCOL]);
});

void test("the custom scheme is registered as secure before Electron readiness", () => {
  let registered: Parameters<Protocol["registerSchemesAsPrivileged"]>[0] | undefined;
  const protocol: Pick<Protocol, "registerSchemesAsPrivileged"> = {
    registerSchemesAsPrivileged(schemes) {
      registered = schemes;
    },
  };

  registerDesktopSchemes(protocol);
  assert.deepEqual(registered, [
    {
      privileges: { secure: true, standard: false },
      scheme: AUTH_PROTOCOL,
    },
    {
      privileges: { secure: true, standard: true, supportFetchAPI: true },
      scheme: "mooligan-image",
    },
  ]);
});

class FakeApp extends EventEmitter implements StartupApp {
  lockData: unknown;
  protocolRegistration: unknown;

  onOpenUrl(listener: Parameters<StartupApp["onOpenUrl"]>[0]) {
    this.on("open-url", listener);
  }

  onSecondInstance(listener: Parameters<StartupApp["onSecondInstance"]>[0]) {
    this.on("second-instance", listener);
  }

  requestSingleInstanceLock(additionalData?: { authCallback?: string }) {
    this.lockData = additionalData;
    return true;
  }

  setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]) {
    this.protocolRegistration = [protocol, path, args].filter((value) => value !== undefined);
    return true;
  }
}

function callback(identifier: string, state: string) {
  const unpadded = Buffer.from(JSON.stringify({ identifier, state })).toString("base64url");
  const token = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, "=");
  return `${AUTH_PROTOCOL}://auth/callback#token=${token}`;
}
