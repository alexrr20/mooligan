import { rename, stat } from "node:fs/promises";

export async function recoverInterruptedReplacement(destination: string, backup: string) {
  if (await exists(destination)) {
    return;
  }

  try {
    await rename(backup, destination);
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isFileNotFound(error)) {
      return false;
    }

    throw error;
  }
}

export function isFileNotFound(cause: unknown) {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
