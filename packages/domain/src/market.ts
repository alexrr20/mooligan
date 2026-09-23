import * as z from "zod";

import { FinishSchema } from "./catalog.ts";

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

export const MoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof MoneySchema>;

export const MarketPriceSchema = z.object({
  supplier: z.literal("mtgjson"),
  market: z.string().regex(/^[a-z0-9_-]+$/),
  kind: z.enum(["retail", "buylist"]),
  finish: FinishSchema.exclude(["glossy"]),
  money: MoneySchema.extend({ amountMinor: z.number().int().nonnegative().safe() }),
  priceDate: z.iso.date(),
});
export type MarketPrice = z.infer<typeof MarketPriceSchema>;

export const PriceSnapshotSchema = z.object({
  date: z.iso.date(),
  fetchedAt: z.iso.datetime(),
  priceCount: z.number().int().positive(),
  unmappedCount: z.number().int().nonnegative(),
  ambiguousCount: z.number().int().nonnegative(),
});
export type PriceSnapshot = z.infer<typeof PriceSnapshotSchema>;

export const PricePhaseSchema = z.enum(["idle", "prices", "identifiers", "installing"]);
export const PriceStatusSchema = z.object({
  snapshot: PriceSnapshotSchema.nullable(),
  phase: PricePhaseSchema,
  error: z.string().nullable(),
});
export type PriceStatus = z.infer<typeof PriceStatusSchema>;

export const PrintingPricesSchema = z.object({
  prices: z.array(MarketPriceSchema),
  snapshot: PriceSnapshotSchema.nullable(),
});
export type PrintingPrices = z.infer<typeof PrintingPricesSchema>;

export const ExchangeRatesSchema = z.object({
  fetchedAt: z.iso.datetime(),
  rates: z
    .array(
      z.object({
        date: z.iso.date(),
        base: z.literal("EUR"),
        quote: z.string().regex(/^[A-Z]{3}$/),
        rate: z.number().positive().finite(),
      }),
    )
    .min(1),
});
export type ExchangeRates = z.infer<typeof ExchangeRatesSchema>;
