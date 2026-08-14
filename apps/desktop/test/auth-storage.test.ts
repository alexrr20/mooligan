import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type AsyncSafeStorage,
  EncryptedAuthStorage,
  type ProtectedAuthState,
  ProtectedStorageError,
} from "../electron/auth/storage.ts";

void test("authentication state is asynchronously encrypted, atomically replaced, and reopened", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-auth-storage-"));
  const path = join(directory, "auth-state");
  const safeStorage = new FakeSafeStorage();
  const storage = new EncryptedAuthStorage(path, safeStorage);
  const state: ProtectedAuthState = {
    cookies: {
      "better-auth.session_token": { expiresAt: 1_800_000, value: "session-secret" },
    },
    pendingAuth: {
      expiresAt: 1_500_000,
      state: "state-secret",
      verifier: "verifier-secret",
    },
    version: 1,
  };

  try {
    await storage.save(state);

    const encrypted = await readFile(path);
    assert.equal(encrypted.includes("session-secret"), false);
    assert.equal(encrypted.includes("verifier-secret"), false);
    assert.deepEqual(await new EncryptedAuthStorage(path, safeStorage).load(), state);

    safeStorage.reEncryptNext = true;
    const encryptionsBeforeRotation = safeStorage.encryptions;
    assert.deepEqual(await new EncryptedAuthStorage(path, safeStorage).load(), state);
    assert.equal(safeStorage.encryptions, encryptionsBeforeRotation + 1);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("unavailable protected storage never creates a plaintext fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-auth-unavailable-"));
  const path = join(directory, "auth-state");
  const storage = new EncryptedAuthStorage(path, new FakeSafeStorage(false));

  try {
    await assert.rejects(storage.load(), ProtectedStorageError);
    await assert.rejects(
      storage.save({ cookies: {}, pendingAuth: null, version: 1 }),
      ProtectedStorageError,
    );
    await assert.rejects(readFile(path), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a decryption failure leaves the existing ciphertext untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-auth-decrypt-failure-"));
  const path = join(directory, "auth-state");
  const ciphertext = Buffer.from("unreadable ciphertext");

  try {
    await writeFile(path, ciphertext);
    await assert.rejects(
      new EncryptedAuthStorage(path, new FakeSafeStorage()).load(),
      ProtectedStorageError,
    );
    assert.deepEqual(await readFile(path), ciphertext);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

class FakeSafeStorage implements AsyncSafeStorage {
  encryptions = 0;
  reEncryptNext = false;
  readonly #available: boolean;

  constructor(available = true) {
    this.#available = available;
  }

  async isAsyncEncryptionAvailable() {
    return this.#available;
  }

  async encryptStringAsync(plainText: string) {
    this.encryptions += 1;
    return Buffer.from(`ciphertext:${Buffer.from(plainText).toString("base64")}`);
  }

  async decryptStringAsync(encrypted: Buffer) {
    const value = encrypted.toString();
    if (!value.startsWith("ciphertext:")) {
      throw new Error("invalid ciphertext");
    }
    const shouldReEncrypt = this.reEncryptNext;
    this.reEncryptNext = false;
    return {
      result: Buffer.from(value.slice("ciphertext:".length), "base64").toString(),
      shouldReEncrypt,
    };
  }
}
