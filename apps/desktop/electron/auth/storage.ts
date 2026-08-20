import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import * as z from "zod";
import type { JSONType } from "zod";

const MAX_ENCRYPTED_STATE_BYTES = 1024 * 1024;
const MAX_PLAINTEXT_STATE_BYTES = 512 * 1024;

export interface AsyncSafeStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export interface StoredAuthCookie {
  value: string;
  expiresAt: number | null;
}

export interface PendingAuth {
  state: string;
  verifier: string;
  expiresAt: number;
}

export interface StoredAuthUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

export interface ProtectedAuthState {
  version: 2;
  cookies: Record<string, StoredAuthCookie>;
  pendingAuth: PendingAuth | null;
  user: StoredAuthUser | null;
}

const StoredAuthCookieSchema = z.object({
  expiresAt: z.number().finite().nullable(),
  value: z.string(),
});
const PendingAuthSchema = z.object({
  expiresAt: z.number().finite(),
  state: z.string(),
  verifier: z.string(),
});
const StoredAuthUserSchema = z.strictObject({
  email: z.string().min(1).max(320),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  image: z.string().max(2_048).nullable(),
  name: z.string().min(1).max(200),
});
export const ProtectedAuthStateSchema = z.strictObject({
  cookies: z.record(z.string(), StoredAuthCookieSchema),
  pendingAuth: PendingAuthSchema.nullable(),
  user: StoredAuthUserSchema.nullable(),
  version: z.literal(2),
});
const LegacyProtectedAuthStateSchema = z.strictObject({
  cookies: z.record(z.string(), StoredAuthCookieSchema),
  pendingAuth: PendingAuthSchema.nullable(),
  version: z.literal(1),
});
export interface AuthStateStorage {
  load(): Promise<ProtectedAuthState>;
  save(state: ProtectedAuthState): Promise<void>;
}

export class ProtectedStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtectedStorageError";
  }
}

export class EncryptedAuthStorage implements AuthStateStorage {
  readonly #filePath: string;
  readonly #safeStorage: AsyncSafeStorage;
  #availability: Promise<void> | undefined;

  constructor(filePath: string, safeStorage: AsyncSafeStorage) {
    this.#filePath = filePath;
    this.#safeStorage = safeStorage;
  }

  async load(): Promise<ProtectedAuthState> {
    await this.#ensureAvailable();

    let encrypted: Buffer;

    try {
      if ((await stat(this.#filePath)).size > MAX_ENCRYPTED_STATE_BYTES) {
        throw new ProtectedStorageError("Protected authentication state is too large.");
      }
      encrypted = await readFile(this.#filePath);
    } catch (error) {
      if (isFileNotFound(error)) {
        return emptyAuthState();
      }
      if (error instanceof ProtectedStorageError) {
        throw error;
      }
      throw new ProtectedStorageError("Protected authentication state could not be read.", {
        cause: error,
      });
    }

    try {
      const decrypted = await this.#safeStorage.decryptStringAsync(encrypted);

      if (Buffer.byteLength(decrypted.result) > MAX_PLAINTEXT_STATE_BYTES) {
        throw new Error("Decrypted authentication state is too large.");
      }

      const { state, upgraded } = parseProtectedAuthState(decrypted.result);

      if (decrypted.shouldReEncrypt || upgraded) {
        await this.save(state);
      }

      return state;
    } catch (error) {
      if (error instanceof ProtectedStorageError) {
        throw error;
      }
      throw new ProtectedStorageError("Protected authentication state could not be decrypted.", {
        cause: error,
      });
    }
  }

  async save(state: ProtectedAuthState): Promise<void> {
    await this.#ensureAvailable();

    const serialized = JSON.stringify(validateProtectedAuthState(state));

    if (Buffer.byteLength(serialized) > MAX_PLAINTEXT_STATE_BYTES) {
      throw new ProtectedStorageError("Protected authentication state is too large.");
    }

    let encrypted: Buffer;

    try {
      encrypted = await this.#safeStorage.encryptStringAsync(serialized);
    } catch (error) {
      throw new ProtectedStorageError("Authentication state could not be encrypted.", {
        cause: error,
      });
    }

    const directory = dirname(this.#filePath);
    const temporaryPath = `${this.#filePath}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await mkdir(directory, { mode: 0o700, recursive: true });
      await writeFile(temporaryPath, encrypted, { flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.#filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw new ProtectedStorageError("Encrypted authentication state could not be saved.", {
        cause: error,
      });
    }
  }

  #ensureAvailable() {
    return (this.#availability ??= this.#safeStorage
      .isAsyncEncryptionAvailable()
      .then((available) => {
        if (!available) {
          throw new ProtectedStorageError("Protected authentication storage is unavailable.");
        }
      })
      .catch((error) => {
        if (error instanceof ProtectedStorageError) {
          throw error;
        }
        throw new ProtectedStorageError("Protected authentication storage is unavailable.", {
          cause: error,
        });
      }));
  }
}

export function emptyAuthState(): ProtectedAuthState {
  return { cookies: {}, pendingAuth: null, user: null, version: 2 };
}

function parseProtectedAuthState(serialized: string) {
  let value;

  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new ProtectedStorageError("Protected authentication state is invalid.", {
      cause: error,
    });
  }

  const current = ProtectedAuthStateSchema.safeParse(value);
  if (current.success) {
    return { state: current.data, upgraded: false };
  }

  const legacy = LegacyProtectedAuthStateSchema.safeParse(value);
  if (legacy.success) {
    return {
      state: {
        cookies: legacy.data.cookies,
        pendingAuth: legacy.data.pendingAuth,
        user: null,
        version: 2,
      } satisfies ProtectedAuthState,
      upgraded: true,
    };
  }

  throw new ProtectedStorageError("Protected authentication state is invalid.");
}

function validateProtectedAuthState(value: ProtectedAuthState | JSONType): ProtectedAuthState {
  const state = ProtectedAuthStateSchema.safeParse(value);
  if (!state.success) {
    throw new ProtectedStorageError("Protected authentication state is invalid.");
  }
  return state.data;
}

function isFileNotFound(cause: unknown) {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
