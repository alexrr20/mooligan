import type { DeckCost } from "@mooligan/domain/deck-cost";
import { MarketPriceSchema } from "@mooligan/domain/market";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import type { DeckCostRequest } from "@mooligan/workspace/transport";
import { Schema } from "effect";
import type { Mutable } from "effect/Types";

import type { CatalogDatabase } from "./database.ts";
import { lowestRetailPrice } from "./lowest-prices.ts";
import { catalogVisibilityArguments, catalogVisibilitySqlFor } from "./visibility.ts";

const decodePrintingPrice = Schema.decodeUnknownSync(
  Schema.Struct({ ...MarketPriceSchema.fields, printingId: Schema.String }),
);

export function createDeckCostQuery(database: CatalogDatabase) {
  const selectPrices = database.prepare(`
    SELECT sibling.id AS printingId, 'mtgjson' AS supplier,
           prices.market, prices.kind, prices.finish, prices.currency,
           prices.amount_minor AS amountMinor, prices.price_date AS priceDate
    FROM cards
    JOIN cards AS sibling ON sibling.identity_id = cards.identity_id
    JOIN market_prices.prices ON prices.printing_id = sibling.id
    WHERE cards.id = ?
      AND COALESCE(json_extract(cards.json, '$.digital'), 0) = 0
      AND COALESCE(json_extract(sibling.json, '$.digital'), 0) = 0
      AND ${catalogVisibilitySqlFor("cards")}
      AND ${catalogVisibilitySqlFor("sibling")}
      AND prices.kind = 'retail'
      AND prices.market IN (SELECT value FROM json_each(?))
  `);

  return (request: DeckCostRequest, visibility: SpoilerVisibilitySnapshot): DeckCost => {
    const current = emptyTotal();
    const cheapest = emptyTotal();
    const entries = request.entries.filter((entry) => entry.section !== "maybeboard");
    const visibilityArgs = catalogVisibilityArguments(visibility);
    database.exec("BEGIN");
    try {
      const prices = new Map(
        [...new Set(entries.map((entry) => entry.printingId))].map((id) => [
          id,
          selectPrices
            .all(id, ...visibilityArgs, ...visibilityArgs, JSON.stringify(request.providers))
            .map((row) =>
              decodePrintingPrice({
                ...row,
                money: { amountMinor: row.amountMinor, currency: row.currency },
              }),
            ),
        ]),
      );
      for (const entry of entries) {
        const candidates = prices.get(entry.printingId)!;
        addPrice(
          current,
          lowestRetailPrice(
            candidates.filter((price) => price.printingId === entry.printingId),
            request.providers,
            request.currency,
            request.rates,
            entry.finish,
          ),
          entry.quantity,
        );
        addPrice(
          cheapest,
          lowestRetailPrice(candidates, request.providers, request.currency, request.rates),
          entry.quantity,
        );
      }
      database.exec("COMMIT");
      return {
        currency: request.currency,
        quantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
        current,
        cheapest,
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

function emptyTotal(): Mutable<DeckCost["current"]> {
  return { amount: 0, pricedQuantity: 0, priceDate: null, rateDate: null, missingRates: false };
}

function addPrice(
  total: Mutable<DeckCost["current"]>,
  { lowest, missingRates }: ReturnType<typeof lowestRetailPrice>,
  quantity: number,
) {
  total.missingRates ||= missingRates;
  if (!lowest) return;
  total.amount += lowest.amount * quantity;
  total.pricedQuantity += quantity;
  if (!total.priceDate || lowest.price.priceDate < total.priceDate)
    total.priceDate = lowest.price.priceDate;
  if (lowest.rateDate && (!total.rateDate || lowest.rateDate < total.rateDate))
    total.rateDate = lowest.rateDate;
}
