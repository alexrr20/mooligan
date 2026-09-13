import * as z from "zod";

export const MoneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof MoneySchema>;

export const MarketPriceSchema = z.object({
  supplier: z.literal("mtgjson"),
  market: z.string().regex(/^[a-z0-9_-]+$/),
  kind: z.enum(["retail", "buylist"]),
  finish: z.enum(["nonfoil", "foil", "etched"]),
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
