import { WorkspaceRegistry, type RegistryRow } from "@mooligan/account/registry";
import { randomUUID } from "expo-crypto";
import { openDatabaseSync } from "expo-sqlite";

export function openWorkspaceRegistry() {
  const database = openDatabaseSync("workspace-registry.sqlite");
  database.execSync("PRAGMA busy_timeout = 5000;");
  return new WorkspaceRegistry(
    {
      exec: (sql) => database.execSync(sql),
      close: () => database.closeSync(),
      prepare: (sql) => ({
        get: (...values) => database.getFirstSync<RegistryRow>(sql, values) ?? undefined,
        all: (...values) => database.getAllSync<RegistryRow>(sql, values),
        run: (...values) => database.runSync(sql, values),
      }),
    },
    randomUUID,
  );
}
