import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

export interface ProtectedAuthState {
  version: 1;
  cookies: Record<string, StoredAuthCookie>;
  pendingAuth: PendingAuth | null;
}

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

      const state = parseProtectedAuthState(decrypted.result);

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
      .catch((error: unknown) => {
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
  return { cookies: {}, pendingAuth: null, version: 1 };
}

function parseProtectedAuthState(serialized: string) {
  let value: unknown;

  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new ProtectedStorageError("Protected authentication state is invalid.", {
      cause: error,
    });
  }

  return validateProtectedAuthState(value);
}

function validateProtectedAuthState(value: unknown): ProtectedAuthState {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.cookies)) {
    throw new ProtectedStorageError("Protected authentication state is invalid.");
  }

  const cookies: Record<string, StoredAuthCookie> = {};

  for (const [name, cookie] of Object.entries(value.cookies)) {
    if (
      !isRecord(cookie) ||
      typeof cookie.value !== "string" ||
      (cookie.expiresAt !== null &&
        (typeof cookie.expiresAt !== "number" || !Number.isFinite(cookie.expiresAt)))
    ) {
      throw new ProtectedStorageError("Protected authentication state is invalid.");
    }
    cookies[name] = { expiresAt: cookie.expiresAt, value: cookie.value };
  }

  let pendingAuth: PendingAuth | null = null;

  if (value.pendingAuth !== null) {
    if (
      !isRecord(value.pendingAuth) ||
      typeof value.pendingAuth.state !== "string" ||
      typeof value.pendingAuth.verifier !== "string" ||
      typeof value.pendingAuth.expiresAt !== "number" ||
      !Number.isFinite(value.pendingAuth.expiresAt)
    ) {
      throw new ProtectedStorageError("Protected authentication state is invalid.");
    }
    pendingAuth = {
      expiresAt: value.pendingAuth.expiresAt,
      state: value.pendingAuth.state,
      verifier: value.pendingAuth.verifier,
    };
  }

  return { cookies, pendingAuth, version: 1 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
