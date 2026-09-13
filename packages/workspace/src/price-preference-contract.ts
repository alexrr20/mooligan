import { Schema } from "effect";

export const priceProviders = [
  { id: "cardmarket", name: "Cardmarket" },
  { id: "tcgplayer", name: "TCGplayer" },
  { id: "cardkingdom", name: "Card Kingdom" },
  { id: "cardsphere", name: "Cardsphere" },
  { id: "manapool", name: "Mana Pool" },
] as const;

export const PriceProviderSchema = Schema.Literal(...priceProviders.map(({ id }) => id));
export type PriceProvider = typeof PriceProviderSchema.Type;
export const enabledPriceProvidersSchema = Schema.Array(PriceProviderSchema).pipe(
  Schema.maxItems(priceProviders.length),
  Schema.filter((providers) => new Set(providers).size === providers.length, {
    message: () => "Price providers must be unique.",
  }),
);

export const priceCurrencies = ["EUR", "USD", "GBP", "CAD", "AUD", "JPY", "CHF"] as const;
export const PriceCurrencySchema = Schema.Literal(...priceCurrencies);
export type PriceCurrency = typeof PriceCurrencySchema.Type;
