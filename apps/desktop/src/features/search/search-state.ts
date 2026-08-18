export type UniverseFilter = "beyond" | "within";

export type CatalogSearchState = {
  adCards?: true;
  artSeries?: true;
  digital?: true;
  grid?: true;
  query?: string;
  tokens?: true;
  uniqueCards?: true;
  universe?: UniverseFilter;
};

export const CatalogSearchStateSchema = z.strictObject({
  adCards: z.literal(true).optional(),
  artSeries: z.literal(true).optional(),
  digital: z.literal(true).optional(),
  grid: z.literal(true).optional(),
  query: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value === value.trim())
    .optional(),
  tokens: z.literal(true).optional(),
  uniqueCards: z.literal(true).optional(),
  universe: z.enum(["beyond", "within"]).optional(),
});
const CatalogSearchInputSchema = z.object({
  adCards: z.json().optional(),
  artSeries: z.json().optional(),
  digital: z.json().optional(),
  grid: z.json().optional(),
  query: z.json().optional(),
  tokens: z.json().optional(),
  uniqueCards: z.json().optional(),
  universe: z.json().optional(),
});

export function reconcileCatalogSearchDraft(
  draft: string,
  previousActiveQuery: string,
  activeQuery: string,
) {
  return draft.trim() === previousActiveQuery ? activeQuery : draft;
}

export function validateCatalogSearch(search: CatalogSearchState | JSONType): CatalogSearchState {
  const input = CatalogSearchInputSchema.parse(search);
  const queryValue = z.string().safeParse(input.query);
  const query = queryValue.success ? queryValue.data.trim().slice(0, 100) : "";

  return {
    ...(input.adCards === true && { adCards: true as const }),
    ...(input.artSeries === true && { artSeries: true as const }),
    ...(input.digital === true && { digital: true as const }),
    ...(input.grid === true && { grid: true as const }),
    ...(query && { query }),
    ...(input.tokens === true && { tokens: true as const }),
    ...(input.uniqueCards === true && { uniqueCards: true as const }),
    ...((input.universe === "beyond" || input.universe === "within") && {
      universe: input.universe,
    }),
  };
}
import * as z from "zod";
import type { JSONType } from "zod";
