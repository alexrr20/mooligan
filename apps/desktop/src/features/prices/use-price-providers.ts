import {
  events,
  priceCurrencyQuery,
  readPriceCurrency,
  type PriceCurrency,
  priceProviderPreferencesQuery,
  readEnabledPriceProviders,
  type PriceProvider,
} from "@mooligan/workspace/schema";

import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export { priceProviders } from "@mooligan/workspace/schema";

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
