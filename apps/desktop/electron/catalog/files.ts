import { rename, stat } from "node:fs/promises";

import * as z from "zod";

const FileSystemErrorSchema = z.object({ code: z.string().optional() });

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

function isFileNotFound(cause: unknown) {
  const error = FileSystemErrorSchema.safeParse(cause);
  return error.success && error.data.code === "ENOENT";
}
