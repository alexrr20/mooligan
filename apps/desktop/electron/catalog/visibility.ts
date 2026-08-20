import {
  SpoilerVisibilitySnapshotSchema,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";

export const effectiveReleaseDateSql = "cards.effective_released_at";

export function catalogVisibilitySqlFor(table: "cards" | "newer") {
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

export type CatalogVisibilityFacts = {
  printingId: string;
  releasedOn: null | string;
  rootSetId: string;
};

export function catalogVisibilityArguments(
  input: SpoilerVisibilitySnapshot,
): readonly [string, string, string, string] {
  const snapshot = SpoilerVisibilitySnapshotSchema.parse(input);
  return [
    snapshot.currentDate,
    snapshot.policy,
    JSON.stringify(snapshot.revealedPrintingIds),
    JSON.stringify(snapshot.revealedRootSetIds),
  ];
}

export function catalogVisibilityReason(
  input: SpoilerVisibilitySnapshot,
  facts: CatalogVisibilityFacts,
): "global" | "printing" | "release" | "released" | null {
  const snapshot = SpoilerVisibilitySnapshotSchema.parse(input);

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
