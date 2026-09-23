import type { DeckCost } from "@mooligan/domain/deck-cost";

export const deckCostScope = "Includes all deck sections except the maybeboard.";

export function deckCostMetrics(cost: DeckCost) {
  const format = new Intl.NumberFormat(undefined, { style: "currency", currency: cost.currency });
  return (["current", "cheapest"] as const).map((key) => {
    const total = cost[key];
    const partial = total.pricedQuantity < cost.quantity;
    const unavailable = cost.quantity > 0 && total.pricedQuantity === 0;
    return {
      label: key === "current" ? "Current printings" : "Cheapest printings",
      value: unavailable
        ? "Unavailable"
        : `${total.rateDate ? "≈ " : ""}${format.format(total.amount)}${partial ? " · partial" : ""}`,
      coverage: partial ? `Prices for ${total.pricedQuantity} of ${cost.quantity} copies` : null,
      description: [
        key === "current"
          ? "Selected printings and finishes."
          : "Lowest priced paper printing of each card, in any finish. Your deck stays unchanged.",
        "Retail references from your enabled markets.",
        total.priceDate ? `Oldest price: ${total.priceDate}.` : "",
        total.rateDate ? `Converted using exchange rates from ${total.rateDate}.` : "",
        total.missingRates ? "Some market prices could not be converted." : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}
