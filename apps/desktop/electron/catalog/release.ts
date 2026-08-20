import type { DatabaseSync } from "node:sqlite";

import type { CatalogReleaseSummary } from "@mooligan/domain/spoilers";
import * as z from "zod";

export const CatalogReleaseSummaryRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nextReleaseOn: z.iso.date(),
  rootSetId: z.string().min(1),
});
export type CatalogReleaseSummaryRow = z.infer<typeof CatalogReleaseSummaryRowSchema>;

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
    const row = CatalogReleaseSummaryRowSchema.safeParse(selectRelease.get(rootSetId, currentDate));
    if (!row.success) {
      throw new Error("The local card catalog contains an invalid release family.");
    }
    return toCatalogReleaseSummary(row.data);
  };
}

export function toCatalogReleaseSummary(row: CatalogReleaseSummaryRow): CatalogReleaseSummary {
  return {
    ...row,
    symbol: { setId: row.rootSetId },
  };
}
