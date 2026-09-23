export type CatalogValue = string | number | bigint | null | Uint8Array;
export type CatalogRow = Record<string, CatalogValue>;
export type CatalogParameter = string | number | null;
export type CatalogParameters = Record<string, CatalogParameter>;
export type CatalogArguments = CatalogParameter[] | [CatalogParameters];

/** The SQL operations shared by Node SQLite and Expo SQLite. */
export interface CatalogDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: CatalogParameter[]): CatalogRow | undefined;
    get(parameters: CatalogParameters): CatalogRow | undefined;
    all(...values: CatalogParameter[]): CatalogRow[];
    all(parameters: CatalogParameters): CatalogRow[];
    run(...values: CatalogParameter[]): void;
    run(parameters: CatalogParameters): void;
  };
}
