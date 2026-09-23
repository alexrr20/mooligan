import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { type JsonValue, StrictStruct } from "@mooligan/domain/schema";
import { Either, Schema } from "effect";

import type { AuthUser } from "../../shared/desktop-api.ts";

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

export type StoredAuthUser = AuthUser;

export interface ProtectedAuthState {
  version: 2;
  cookies: Record<string, StoredAuthCookie>;
  pendingAuth: PendingAuth | null;
  user: StoredAuthUser | null;
}

const StoredAuthCookieSchema = Schema.Struct({
  expiresAt: Schema.NullOr(Schema.Finite),
  value: Schema.String,
});
const PendingAuthSchema = Schema.Struct({
  expiresAt: Schema.Finite,
  state: Schema.String,
  verifier: Schema.String,
});
const StoredAuthUserSchema = StrictStruct({
  email: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(320)),
  id: Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]{1,128}$/)),
  image: Schema.NullOr(Schema.String.pipe(Schema.maxLength(2_048))),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
});
export const ProtectedAuthStateSchema = StrictStruct({
  cookies: Schema.Record({ key: Schema.String, value: StoredAuthCookieSchema }),
  pendingAuth: Schema.NullOr(PendingAuthSchema),
  user: Schema.NullOr(StoredAuthUserSchema),
  version: Schema.Literal(2),
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

      const state = validateProtectedAuthState(JSON.parse(decrypted.result));

      if (decrypted.shouldReEncrypt) {
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

function validateProtectedAuthState(value: ProtectedAuthState | JsonValue): ProtectedAuthState {
  const state = Schema.decodeUnknownEither(ProtectedAuthStateSchema)(value);
  if (Either.isLeft(state)) {
    throw new ProtectedStorageError("Protected authentication state is invalid.");
  }
  return state.right;
}

function isFileNotFound(cause: unknown) {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
