import { FinishSchema, type Finish } from "@mooligan/domain/catalog";
import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
  type CardCondition,
  type CardLanguage,
  type CollectionSort,
} from "@mooligan/domain/collection";
import { JsonValueSchema, type JsonValue } from "@mooligan/domain/schema";
import { Either, Schema } from "effect";

export type CollectionSearchState = {
  condition?: CardCondition;
  finish?: Finish;
  language?: CardLanguage;
  query?: string;
  set?: string;
  sort?: Exclude<CollectionSort, "name">;
};

type CollectionSearchInput = CollectionSearchState | JsonValue;

const CollectionSearchInputSchema = Schema.Struct({
  condition: Schema.optional(JsonValueSchema),
  finish: Schema.optional(JsonValueSchema),
  language: Schema.optional(JsonValueSchema),
  query: Schema.optional(Schema.String),
  set: Schema.optional(Schema.String),
  sort: Schema.optional(JsonValueSchema),
});

export function validateCollectionSearch(value: CollectionSearchInput): CollectionSearchState {
  const parsed = Schema.decodeUnknownEither(CollectionSearchInputSchema)(value);
  if (Either.isLeft(parsed)) return {};
  const input = parsed.right;
  const query = input.query?.trim().slice(0, 500) ?? "";
  const set = input.set?.trim().slice(0, 16).toLowerCase() ?? "";
  const finish = Schema.decodeUnknownEither(FinishSchema)(input.finish);
  const language = Schema.decodeUnknownEither(CardLanguageSchema)(input.language);
  const condition = Schema.decodeUnknownEither(CardConditionSchema)(input.condition);
  const sort = Schema.decodeUnknownEither(CollectionSortSchema)(input.sort);

  return {
    ...(Either.isRight(condition) && { condition: condition.right }),
    ...(Either.isRight(finish) && { finish: finish.right }),
    ...(Either.isRight(language) && { language: language.right }),
    ...(query && { query }),
    ...(set && { set }),
    ...(Either.isRight(sort) && sort.right !== "name" && { sort: sort.right }),
  };
}
