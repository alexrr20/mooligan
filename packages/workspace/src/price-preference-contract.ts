import { priceCurrencies, priceProviders } from "@mooligan/domain/market";
import { Schema } from "effect";

export const PriceProviderSchema = Schema.Literal(...priceProviders);
export const EnabledPriceProvidersSchema = Schema.Array(PriceProviderSchema).pipe(
  Schema.maxItems(priceProviders.length),
  Schema.filter((providers) => new Set(providers).size === providers.length, {
    message: () => "Price providers must be unique.",
  }),
);

export const PriceCurrencySchema = Schema.Literal(...priceCurrencies);
