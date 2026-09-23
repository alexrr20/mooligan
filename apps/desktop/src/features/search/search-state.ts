import type { JsonValue } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";
import { optionalSearchParam, searchText } from "./search-params.ts";

const UniverseFilterSchema = Schema.Literal("beyond", "within");
export type UniverseFilter = typeof UniverseFilterSchema.Type;

const CatalogSearchInputSchema = Schema.Struct({
  adCards: optionalSearchParam(Schema.Literal(true)),
  artSeries: optionalSearchParam(Schema.Literal(true)),
  digital: optionalSearchParam(Schema.Literal(true)),
  grid: optionalSearchParam(Schema.Literal(true)),
  mode: optionalSearchParam(Schema.Literal("upcoming")),
  query: optionalSearchParam(searchText(500)),
  tokens: optionalSearchParam(Schema.Literal(true)),
  uniqueCards: optionalSearchParam(Schema.Literal(true)),
  universe: optionalSearchParam(UniverseFilterSchema),
});

export const CatalogSearchStateSchema = Schema.typeSchema(CatalogSearchInputSchema).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CatalogSearchState = typeof CatalogSearchStateSchema.Type;

export function validateCatalogSearch(search: CatalogSearchState | JsonValue): CatalogSearchState {
  return Option.getOrElse(Schema.decodeUnknownOption(CatalogSearchInputSchema)(search), () => ({}));
}

export function reconcileCatalogSearchDraft(
  draft: string,
  previousActiveQuery: string,
  activeQuery: string,
) {
  return draft.trim() === previousActiveQuery ? activeQuery : draft;
}
