import { Events, queryDb, Schema, State } from "@livestore/livestore";

import { priceProviders, type PriceProvider } from "@mooligan/domain/market";

import { PriceCurrencySchema, PriceProviderSchema } from "./price-preference-contract.ts";

const preferenceSchema = Schema.Struct({ provider: PriceProviderSchema, enabled: Schema.Boolean });

export const pricePreferenceTables = {
  priceCurrency: State.SQLite.table({
    name: "price_currency",
    schema: Schema.Struct({
      id: Schema.Literal("default").pipe(State.SQLite.withPrimaryKey),
      currency: PriceCurrencySchema,
    }),
  }),
  priceProviderPreferences: State.SQLite.table({
    name: "price_provider_preferences",
    schema: Schema.Struct({
      provider: PriceProviderSchema.pipe(State.SQLite.withPrimaryKey),
      enabled: Schema.Boolean,
    }),
  }),
};

export const pricePreferenceEvents = {
  priceCurrencyChanged: Events.synced({
    name: "v1.PriceCurrencyChanged",
    schema: Schema.Struct({ currency: PriceCurrencySchema }),
  }),
  priceProviderChanged: Events.synced({
    name: "v1.PriceProviderChanged",
    schema: preferenceSchema,
  }),
};

export const pricePreferenceMaterializers = {
  "v1.PriceCurrencyChanged": ({ currency }: { currency: typeof PriceCurrencySchema.Type }) =>
    pricePreferenceTables.priceCurrency
      .insert({ id: "default", currency })
      .onConflict("id", "update", { currency }),
  "v1.PriceProviderChanged": (preference: typeof preferenceSchema.Type) =>
    pricePreferenceTables.priceProviderPreferences
      .insert(preference)
      .onConflict("provider", "update", { enabled: preference.enabled }),
};

export const priceProviderPreferencesQuery = queryDb(
  pricePreferenceTables.priceProviderPreferences.orderBy("provider", "asc"),
  { label: "price-provider-preferences" },
);

export function readEnabledPriceProviders(
  rows: readonly (typeof pricePreferenceTables.priceProviderPreferences.Type)[],
): PriceProvider[] {
  const preferences = new Map(rows.map(({ provider, enabled }) => [provider, enabled]));
  return priceProviders.filter((provider) => preferences.get(provider) ?? true);
}

export const priceCurrencyQuery = queryDb(pricePreferenceTables.priceCurrency, {
  label: "price-currency",
});
export const readPriceCurrency = (
  rows: readonly (typeof pricePreferenceTables.priceCurrency.Type)[],
) => rows[0]?.currency ?? "EUR";
