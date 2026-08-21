import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
} from "@mooligan/domain/collection";
import { FinishSchema } from "@mooligan/domain/catalog";
import * as z from "zod";
import type { JSONType } from "zod";

export type CollectionSearchState = {
  condition?: "near-mint" | "lightly-played" | "moderately-played" | "heavily-played" | "damaged";
  finish?: "nonfoil" | "foil" | "etched" | "glossy";
  language?:
    | "en"
    | "es"
    | "fr"
    | "de"
    | "it"
    | "pt"
    | "ja"
    | "ko"
    | "ru"
    | "zhs"
    | "zht"
    | "he"
    | "la"
    | "grc"
    | "ar"
    | "sa"
    | "ph";
  query?: string;
  set?: string;
  sort?: "set" | "quantity";
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
