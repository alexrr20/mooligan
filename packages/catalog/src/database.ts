export type CatalogValue = string | number | bigint | null | Uint8Array;
export type CatalogRow = Record<string, CatalogValue>;
export type CatalogParameter = string | number | null;

/** The SQL operations shared by Node SQLite and Expo SQLite. */
export interface CatalogDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: CatalogParameter[]): CatalogRow | undefined;
    all(...values: CatalogParameter[]): CatalogRow[];
    run(...values: CatalogParameter[]): void;
  };
}
