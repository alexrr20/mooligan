import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import type { App, Protocol } from "electron";

import { registerAuthColdStart, registerAuthScheme } from "../electron/auth/startup.ts";
import { AUTH_PROTOCOL } from "../electron/auth/service.ts";

void test("cold-start callbacks queue before readiness and duplicate OS delivery is harmless", async () => {
  const state = "S".repeat(43);
  const initial = callback("A".repeat(32), state);
  const later = callback("B".repeat(32), state);
  const app = new FakeApp();
  const coldStart = registerAuthColdStart(app as unknown as App, ["mooligan", initial]);
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
  let registered: unknown;
  const protocol = {
    registerSchemesAsPrivileged(schemes: unknown) {
      registered = schemes;
    },
  };

  registerAuthScheme(protocol as unknown as Protocol);
  assert.deepEqual(registered, [
    {
      privileges: { secure: true, standard: false },
      scheme: AUTH_PROTOCOL,
    },
  ]);
});

class FakeApp extends EventEmitter {
  lockData: unknown;
  protocolRegistration: unknown;

  requestSingleInstanceLock(additionalData?: Record<string, unknown>) {
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
