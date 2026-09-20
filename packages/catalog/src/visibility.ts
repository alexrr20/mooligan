import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import type { CatalogDatabase } from "./database";

export const effectiveReleaseDateSql = "cards.effective_released_at";

export function catalogVisibilitySqlFor(table: "cards" | "newer" | "sibling") {
  const releaseDate = `${table}.effective_released_at`;
  return `(
  ${releaseDate} IS NULL
  OR ${releaseDate} <= ?
  OR ? = 'show'
  OR EXISTS (
    SELECT 1 FROM json_each(?) AS revealed_printings
    WHERE revealed_printings.value = ${table}.id
  )
  OR EXISTS (
    SELECT 1 FROM json_each(?) AS revealed_releases
    WHERE revealed_releases.value = ${table}.root_set_id
  )
)`;
}

export const catalogVisibilitySql = catalogVisibilitySqlFor("cards");

export function createCatalogVisibilityQuery(database: CatalogDatabase) {
  const select = database.prepare(
    `SELECT 1 FROM cards WHERE cards.id = ? AND ${catalogVisibilitySql}`,
  );
  return (printingId: string, snapshot: SpoilerVisibilitySnapshot) =>
    select.get(printingId, ...catalogVisibilityArguments(snapshot)) !== undefined;
}

export type CatalogVisibilityFacts = {
  printingId: string;
  releasedOn: null | string;
  rootSetId: string;
};

export function catalogVisibilityArguments(
  snapshot: SpoilerVisibilitySnapshot,
): readonly [string, string, string, string] {
  return [
    snapshot.currentDate,
    snapshot.policy,
    JSON.stringify(snapshot.revealedPrintingIds),
    JSON.stringify(snapshot.revealedRootSetIds),
  ];
}

export function catalogVisibilityReason(
  snapshot: SpoilerVisibilitySnapshot,
  facts: CatalogVisibilityFacts,
): "global" | "printing" | "release" | "released" | null {
  if (facts.releasedOn === null || facts.releasedOn <= snapshot.currentDate) {
    return "released";
  }
  if (snapshot.policy === "show") {
    return "global";
  }
  if (snapshot.revealedRootSetIds.includes(facts.rootSetId)) {
    return "release";
  }
  if (snapshot.revealedPrintingIds.includes(facts.printingId)) {
    return "printing";
  }
  return null;
}
