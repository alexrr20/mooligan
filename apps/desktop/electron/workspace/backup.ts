import { open } from "node:fs/promises";

import {
  workspaceBackupMaxBytes,
  workspaceBackupSchema,
  type WorkspaceBackup,
} from "@mooligan/workspace/backup";
import { Schema } from "effect";
import type { JSONType } from "zod";

const decodeWorkspaceBackup = Schema.decodeUnknownSync(workspaceBackupSchema, {
  onExcessProperty: "error",
});
const FILE_READ_CHUNK_BYTES = 64 * 1024;

export function parseWorkspaceBackup(serialized: string): WorkspaceBackup {
  if (Buffer.byteLength(serialized, "utf8") > workspaceBackupMaxBytes) {
    throw new TypeError("The workspace backup is invalid or too large.");
  }

  let value: JSONType;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError("The workspace backup is not valid JSON.");
  }

  return validateWorkspaceBackup(value);
}

export function validateWorkspaceBackup(value: JSONType | WorkspaceBackup): WorkspaceBackup {
  try {
    return decodeWorkspaceBackup(value);
  } catch {
    throw new TypeError("The workspace backup is invalid or exceeds a limit.");
  }
}

export function serializeWorkspaceBackup(value: WorkspaceBackup): string {
  const serialized = `${JSON.stringify(validateWorkspaceBackup(value), null, 2)}\n`;

  if (Buffer.byteLength(serialized, "utf8") > workspaceBackupMaxBytes) {
    throw new TypeError("The workspace backup is invalid or too large.");
  }

  return serialized;
}

export async function readUtf8FileWithinLimit(path: string) {
  const file = await open(path, "r");

  try {
    const info = await file.stat();
    if (!info.isFile()) {
      throw new TypeError("The workspace backup path is not a file.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    while (totalBytes <= workspaceBackupMaxBytes) {
      const remainingBytes = workspaceBackupMaxBytes + 1 - totalBytes;
      const chunk = Buffer.allocUnsafe(Math.min(FILE_READ_CHUNK_BYTES, remainingBytes));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }

    if (totalBytes > workspaceBackupMaxBytes) {
      throw new TypeError("The workspace backup is too large.");
    }

    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } finally {
    await file.close();
  }
}
