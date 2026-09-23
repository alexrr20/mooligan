import { FinishSchema } from "@mooligan/domain/catalog";
import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
} from "@mooligan/domain/collection";
import type { JsonValue } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";
import { optionalSearchParam, searchText } from "../search/search-params.ts";

const CollectionSearchInputSchema = Schema.Struct({
  condition: optionalSearchParam(CardConditionSchema),
  finish: optionalSearchParam(FinishSchema),
  language: optionalSearchParam(CardLanguageSchema),
  query: optionalSearchParam(searchText(500)),
  set: optionalSearchParam(
    searchText(16).pipe(
      Schema.compose(Schema.Lowercase),
      Schema.minLength(1),
      Schema.maxLength(16),
      Schema.trimmed(),
    ),
  ),
  sort: optionalSearchParam(CollectionSortSchema.pipe(Schema.filter((value) => value !== "name"))),
});

export const CollectionSearchStateSchema = Schema.typeSchema(
  CollectionSearchInputSchema,
).annotations({
  parseOptions: { onExcessProperty: "error" },
});
export type CollectionSearchState = typeof CollectionSearchStateSchema.Type;

export function validateCollectionSearch(
  value: CollectionSearchState | JsonValue,
): CollectionSearchState {
  return Option.getOrElse(
    Schema.decodeUnknownOption(CollectionSearchInputSchema)(value),
    () => ({}),
  );
}
