import { Schema } from "effect";

import { type Finish, FinishSchema } from "./catalog.ts";
import { IsoDateSchema, IsoDateTimeSchema } from "./schema.ts";

/** Markets whose prices a Workspace can enable. */
export const priceProviders = [
  "cardmarket",
  "tcgplayer",
  "cardkingdom",
  "cardsphere",
  "manapool",
] as const;
export type PriceProvider = (typeof priceProviders)[number];
export const priceProviderLabels = {
  cardmarket: "Cardmarket",
  tcgplayer: "TCGplayer",
  cardkingdom: "Card Kingdom",
  cardsphere: "Cardsphere",
  manapool: "Mana Pool",
} as const satisfies Record<PriceProvider, string>;

/** Currencies a Workspace can display prices in. EUR is the exchange-rate base. */
export const priceCurrencies = ["EUR", "USD", "GBP", "CAD", "AUD", "JPY", "CHF"] as const;
export type PriceCurrency = (typeof priceCurrencies)[number];

const CurrencyCodeSchema = Schema.String.pipe(Schema.pattern(/^[A-Z]{3}$/));

export const MoneySchema = Schema.Struct({
  amountMinor: Schema.Int,
  currency: CurrencyCodeSchema,
});
export type Money = typeof MoneySchema.Type;

export const MarketPriceSchema = Schema.Struct({
  supplier: Schema.Literal("mtgjson"),
  market: Schema.String.pipe(Schema.pattern(/^[a-z0-9_-]+$/)),
  kind: Schema.Literal("retail", "buylist"),
  finish: FinishSchema.pipe(
    Schema.filter((finish): finish is Exclude<Finish, "glossy"> => finish !== "glossy"),
  ),
  money: Schema.Struct({ ...MoneySchema.fields, amountMinor: Schema.NonNegativeInt }),
  priceDate: IsoDateSchema,
});
export type MarketPrice = typeof MarketPriceSchema.Type;

export const PriceSnapshotSchema = Schema.Struct({
  date: IsoDateSchema,
  fetchedAt: IsoDateTimeSchema,
  priceCount: Schema.Int.pipe(Schema.positive()),
  unmappedCount: Schema.NonNegativeInt,
  ambiguousCount: Schema.NonNegativeInt,
});
export type PriceSnapshot = typeof PriceSnapshotSchema.Type;

export const PricePhaseSchema = Schema.Literal("idle", "prices", "identifiers", "installing");
export const PriceStatusSchema = Schema.Struct({
  snapshot: Schema.NullOr(PriceSnapshotSchema),
  phase: PricePhaseSchema,
  error: Schema.NullOr(Schema.String),
});
export type PriceStatus = typeof PriceStatusSchema.Type;

export const PrintingPricesSchema = Schema.Struct({
  prices: Schema.Array(MarketPriceSchema),
  snapshot: Schema.NullOr(PriceSnapshotSchema),
});
export type PrintingPrices = typeof PrintingPricesSchema.Type;

export const ExchangeRatesSchema = Schema.Struct({
  fetchedAt: IsoDateTimeSchema,
  rates: Schema.Array(
    Schema.Struct({
      date: IsoDateSchema,
      base: Schema.Literal("EUR"),
      quote: CurrencyCodeSchema,
      rate: Schema.Finite.pipe(Schema.positive()),
    }),
  ).pipe(Schema.minItems(1)),
});
export type ExchangeRates = typeof ExchangeRatesSchema.Type;
