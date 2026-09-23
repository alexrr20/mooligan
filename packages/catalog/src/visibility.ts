import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import type { CatalogDatabase } from "./database";

export const effectiveReleaseDateSql = "cards.effective_released_at";

export function catalogVisibilitySqlFor(table: "cards" | "newer" | "sibling") {
  const releaseDate = `${table}.effective_released_at`;
  return `(
  ${releaseDate} IS NULL
  OR ${releaseDate} <= $visibilityDate
  OR $visibilityPolicy = 'show'
  OR EXISTS (
    SELECT 1 FROM json_each($revealedPrintingIds) AS revealed_printings
    WHERE revealed_printings.value = ${table}.id
  )
  OR EXISTS (
    SELECT 1 FROM json_each($revealedRootSetIds) AS revealed_releases
    WHERE revealed_releases.value = ${table}.root_set_id
  )
)`;
}

export const catalogVisibilitySql = catalogVisibilitySqlFor("cards");

export function createCatalogVisibilityQuery(database: CatalogDatabase) {
  const select = database.prepare(
    `SELECT 1 FROM cards WHERE cards.id = $printingId AND ${catalogVisibilitySql}`,
  );
  return (printingId: string, snapshot: SpoilerVisibilitySnapshot) =>
    select.get({ $printingId: printingId, ...catalogVisibilityParameters(snapshot) }) !== undefined;
}

export type CatalogVisibilityFacts = {
  printingId: string;
  releasedOn: null | string;
  rootSetId: string;
};

export function catalogVisibilityParameters(snapshot: SpoilerVisibilitySnapshot) {
  return {
    $visibilityDate: snapshot.currentDate,
    $visibilityPolicy: snapshot.policy,
    $revealedPrintingIds: JSON.stringify(snapshot.revealedPrintingIds),
    $revealedRootSetIds: JSON.stringify(snapshot.revealedRootSetIds),
  };
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
