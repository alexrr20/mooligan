import { openDatabaseSync, type SQLiteStatement } from "expo-sqlite";
import type {
  CatalogArguments,
  CatalogDatabase,
  CatalogParameters,
  CatalogRow,
} from "@mooligan/catalog/database";

export function openCatalogDatabase(name: string) {
  const database = openDatabaseSync(name, { useNewConnection: true });
  const statements = new Map<string, SQLiteStatement>();
  function statement(sql: string) {
    let prepared = statements.get(sql);
    if (!prepared) {
      if (statements.size >= 100) {
        const first = statements.entries().next().value;
        if (first) {
          first[1].finalizeSync();
          statements.delete(first[0]);
        }
      }
      prepared = database.prepareSync(sql);
      statements.set(sql, prepared);
    }
    return prepared;
  }
  return {
    path: database.databasePath,
    exec: (sql: string) => database.execSync(sql),
    prepare: (sql: string): ReturnType<CatalogDatabase["prepare"]> => ({
      get: (...values: CatalogArguments) => {
        const result = statement(sql).executeSync<CatalogRow>(isNamed(values) ? values[0] : values);
        try {
          return result.getFirstSync() ?? undefined;
        } finally {
          result.resetSync();
        }
      },
      all: (...values: CatalogArguments) =>
        statement(sql)
          .executeSync<CatalogRow>(isNamed(values) ? values[0] : values)
          .getAllSync(),
      run: (...values: CatalogArguments) => {
        statement(sql).executeSync(isNamed(values) ? values[0] : values);
      },
    }),
    close() {
      for (const prepared of statements.values()) prepared.finalizeSync();
      statements.clear();
      database.closeSync();
    },
  };
}

function isNamed(values: CatalogArguments): values is [CatalogParameters] {
  return values.length === 1 && values[0] !== null && typeof values[0] === "object";
}
