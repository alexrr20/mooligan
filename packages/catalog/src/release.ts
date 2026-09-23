import type { CatalogDatabase as DatabaseSync } from "./database.ts";

import type { CatalogReleaseSummary } from "@mooligan/domain/spoilers";
import { IsoDateSchema } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

export const CatalogReleaseSummaryRowSchema = Schema.Struct({
  code: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  nextReleaseOn: IsoDateSchema,
  rootSetId: Schema.NonEmptyString,
});
export type CatalogReleaseSummaryRow = typeof CatalogReleaseSummaryRowSchema.Type;
const decodeCatalogReleaseSummaryRow = Schema.decodeUnknownOption(CatalogReleaseSummaryRowSchema);

export function createCatalogReleaseSummaryQuery(database: DatabaseSync) {
  const selectRelease = database.prepare(
    `SELECT root_sets.id AS rootSetId,
            root_sets.name,
            root_sets.code,
            MIN(family_cards.effective_released_at) AS nextReleaseOn
     FROM sets AS root_sets
     JOIN cards AS family_cards ON family_cards.root_set_id = root_sets.id
     WHERE root_sets.id = ?
       AND family_cards.effective_released_at > ?
     GROUP BY root_sets.id, root_sets.name, root_sets.code`,
  );

  return (rootSetId: string, currentDate: string): CatalogReleaseSummary => {
    const row = decodeCatalogReleaseSummaryRow(selectRelease.get(rootSetId, currentDate));
    if (Option.isNone(row)) {
      throw new Error("The local card catalog contains an invalid release family.");
    }
    return toCatalogReleaseSummary(row.value);
  };
}

export function toCatalogReleaseSummary(row: CatalogReleaseSummaryRow): CatalogReleaseSummary {
  return {
    ...row,
    symbol: { setId: row.rootSetId },
  };
}
