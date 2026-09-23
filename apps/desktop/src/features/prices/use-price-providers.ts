import { events } from "@mooligan/workspace/schema";
import {
  priceCurrencyQuery,
  priceProviderPreferencesQuery,
  readEnabledPriceProviders,
  readPriceCurrency,
} from "@mooligan/workspace/price-preferences";
import type { PriceCurrency, PriceProvider } from "@mooligan/domain/market";

import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export function usePriceProviders() {
  const store = useWorkspaceLiveStore();
  const preferences = store.useQuery(priceProviderPreferencesQuery);
  const currency = readPriceCurrency(store.useQuery(priceCurrencyQuery));
  return {
    currency,
    setCurrency: (currency: PriceCurrency) =>
      store.commit(events.priceCurrencyChanged({ currency })),
    enabledProviders: readEnabledPriceProviders(preferences),
    setProviderEnabled: (provider: PriceProvider, enabled: boolean) => {
      store.commit(events.priceProviderChanged({ provider, enabled }));
    },
  };
}
