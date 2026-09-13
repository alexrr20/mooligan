import { priceCurrencies } from "@mooligan/workspace/schema";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../../components/ui/select";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { Button } from "../../components/ui/button";
import { Checkbox } from "@base-ui/react/checkbox";
import { priceProviders, usePriceProviders } from "./use-price-providers";
import { colors } from "../../styles/tokens.stylex.js";

export function usePriceUpdates() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      window.prices.onUpdated(() => {
        void queryClient.invalidateQueries({ queryKey: ["prices"] });
        void queryClient.invalidateQueries({ queryKey: ["catalog"] });
        void queryClient.invalidateQueries({ queryKey: ["collection"] });
      }),
    [queryClient],
  );
}

export function PriceUpdateControl() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["prices", "status"],
    queryFn: () => window.prices.status(),
    refetchInterval: (query) => (query.state.data?.phase !== "idle" ? 1000 : 60_000),
  });
  const refresh = useMutation({
    mutationFn: () => window.prices.refresh(),
    onSuccess: (value) => queryClient.setQueryData(["prices", "status"], value),
  });
  const data = status.data;
  const busy = refresh.isPending || (data !== undefined && data.phase !== "idle");
  const message =
    data?.phase === "identifiers"
      ? "Downloading printing matches. The first download is about 218 MB."
      : data?.phase === "installing"
        ? "Installing prices…"
        : busy
          ? "Downloading daily prices…"
          : data?.snapshot
            ? `Price release ${data.snapshot.date} · Saved on this device`
            : "Download prices to make them available offline.";
  const error =
    data?.error ??
    (status.isError || refresh.isError ? "Prices could not be updated. Try again." : null);

  return (
    <div {...stylex.props(styles.update)}>
      <div {...stylex.props(styles.row)}>
        <p {...stylex.props(styles.copy)} role="status">
          {message}
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || status.isPending}
          onClick={() => refresh.mutate()}
        >
          {busy ? "Updating…" : "Update prices"}
        </Button>
      </div>
      {error ? (
        <p {...stylex.props(styles.error)} role="alert">
          {error}
          {data?.snapshot ? " Cached prices remain available." : null}
        </p>
      ) : null}
    </div>
  );
}

export function PriceSettings() {
  const { enabledProviders, setProviderEnabled, currency, setCurrency } = usePriceProviders();
  return (
    <section {...stylex.props(styles.settings)} aria-labelledby="price-settings-heading">
      <h2 {...stylex.props(styles.title)} id="price-settings-heading">
        Card prices
      </h2>
      <p {...stylex.props(styles.copy)}>
        Daily paper prices supplied by MTGJSON. Prices update automatically and stay available
        offline on this device. Printing matches refresh weekly.
      </p>
      <div {...stylex.props(styles.providers)}>
        <p id="price-currency-label" {...stylex.props(styles.legend)}>
          Default currency
        </p>
        <Select
          value={currency}
          onValueChange={(value) => {
            if (value) setCurrency(value);
          }}
        >
          <SelectTrigger aria-labelledby="price-currency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priceCurrencies.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p {...stylex.props(styles.copy)}>
          Prices are compared in this currency using saved ECB exchange rates. Converted amounts are
          estimates. This setting syncs with your account.
        </p>
      </div>
      <fieldset {...stylex.props(styles.providers)}>
        <legend {...stylex.props(styles.legend)}>Price providers</legend>
        <p {...stylex.props(styles.copy)}>
          Choose which markets appear in card prices. Your selection is saved in this workspace and
          syncs across devices when connected to your account.
        </p>
        <div {...stylex.props(styles.providerList)}>
          {priceProviders.map((provider) => (
            <label key={provider.id} {...stylex.props(styles.provider)}>
              <Checkbox.Root
                checked={enabledProviders.includes(provider.id)}
                onCheckedChange={(checked) => setProviderEnabled(provider.id, checked)}
                {...stylex.props(styles.checkbox)}
              >
                <Checkbox.Indicator>✓</Checkbox.Indicator>
              </Checkbox.Root>
              {provider.name}
            </label>
          ))}
        </div>
        {!enabledProviders.length ? (
          <p {...stylex.props(styles.copy)}>All price providers are disabled.</p>
        ) : null}
      </fieldset>
      <PriceUpdateControl />
    </section>
  );
}

const styles = stylex.create({
  providers: { margin: "24px 0 0", padding: 0, borderWidth: 0, minWidth: 0 },
  legend: { padding: 0, marginBottom: "8px", color: "#dedfd5", fontSize: "15px", fontWeight: 500 },
  providerList: { display: "flex", flexWrap: "wrap", gap: "12px 24px", marginBlock: "16px" },
  provider: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minHeight: "40px",
    color: "#c6c8bd",
    fontSize: "14px",
    cursor: "pointer",
  },
  checkbox: {
    display: "grid",
    placeItems: "center",
    width: "20px",
    height: "20px",
    border: "1px solid #56594f",
    borderRadius: "4px",
    color: "#0a0a0a",
    backgroundColor: "#171914",
    "[data-checked]": { backgroundColor: colors.accent, borderColor: colors.accent },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "3px" },
  },
  settings: { marginBlock: "48px", paddingBlock: "24px", borderTop: "1px solid #252721" },
  title: { margin: "0 0 12px", color: "#f4f1e8", fontSize: "24px", fontWeight: 500 },
  update: { marginTop: "20px" },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "16px",
  },
  copy: { margin: 0, color: "#989b92", fontSize: "13px", lineHeight: 1.6 },
  error: { margin: "12px 0 0", color: "#ef9a8f", fontSize: "13px", lineHeight: 1.6 },
});
