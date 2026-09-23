import { FinishSchema, type Finish } from "@mooligan/domain/catalog";
import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
  type CardCondition,
  type CardLanguage,
  type CollectionSort,
} from "@mooligan/domain/collection";
import * as z from "zod";
import type { JSONType } from "zod";

export type CollectionSearchState = {
  condition?: CardCondition;
  finish?: Finish;
  language?: CardLanguage;
  query?: string;
  set?: string;
  sort?: Exclude<CollectionSort, "name">;
};

type CollectionSearchInput = CollectionSearchState | JSONType;

const CollectionSearchInputSchema = z.looseObject({
  condition: z.json().optional(),
  finish: z.json().optional(),
  language: z.json().optional(),
  query: z.string().optional(),
  set: z.string().optional(),
  sort: z.json().optional(),
});

export function validateCollectionSearch(value: CollectionSearchInput): CollectionSearchState {
  const parsed = CollectionSearchInputSchema.safeParse(value);
  const input = parsed.success ? parsed.data : {};
  const query = input.query?.trim().slice(0, 500) ?? "";
  const set = input.set?.trim().slice(0, 16).toLowerCase() ?? "";
  const finish = FinishSchema.safeParse(input.finish);
  const language = CardLanguageSchema.safeParse(input.language);
  const condition = CardConditionSchema.safeParse(input.condition);
  const sort = CollectionSortSchema.safeParse(input.sort);

  return {
    ...(condition.success && { condition: condition.data }),
    ...(finish.success && { finish: finish.data }),
    ...(language.success && { language: language.data }),
    ...(query && { query }),
    ...(set && { set }),
    ...(sort.success && sort.data !== "name" && { sort: sort.data }),
  };
}
