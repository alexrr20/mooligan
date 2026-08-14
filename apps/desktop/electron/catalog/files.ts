import { rename, stat } from "node:fs/promises";

export async function recoverInterruptedReplacement(destination: string, backup: string) {
  if (await exists(destination)) {
    return;
  }

  try {
    await rename(backup, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
