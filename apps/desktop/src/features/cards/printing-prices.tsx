import * as stylex from "@stylexjs/stylex";

type PrintingPricesProps = {
  variant?: "compact" | "detail";
};

export function PrintingPrices({ variant = "compact" }: PrintingPricesProps) {
  const detail = variant === "detail";

  return (
    <dl {...stylex.props(styles.prices, detail && styles.detailPrices)} aria-label="Prices">
      <div {...stylex.props(styles.price, detail && styles.detailPrice)}>
        <dt
          {...stylex.props(styles.cardIcon, detail && styles.detailCardIcon)}
          aria-label="Regular price"
        />
        <dd {...stylex.props(styles.value, detail && styles.detailValue)}>$0.00</dd>
      </div>
      <div
        {...stylex.props(
          styles.price,
          styles.foilPrice,
          detail && styles.detailPrice,
          detail && styles.detailFoilPrice,
        )}
      >
        <dt
          {...stylex.props(styles.cardIcon, styles.foilCardIcon, detail && styles.detailCardIcon)}
          aria-label="Foil price"
        />
        <dd {...stylex.props(styles.value, detail && styles.detailValue)}>$0.00</dd>
      </div>
    </dl>
  );
}

const styles = stylex.create({
  prices: {
    margin: "11px 0 0",
    padding: "9px 0 0",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    borderTop: "1px solid #34362f",
  },
  detailPrices: {
    marginTop: "14px",
    paddingTop: 0,
    gap: "1px",
    borderTop: 0,
    backgroundColor: "#34362f",
  },
  price: {
    minWidth: 0,
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    alignItems: "center",
    gap: "7px",
  },
  detailPrice: {
    minHeight: "78px",
    padding: "14px 16px",
    alignContent: "center",
    gap: "11px",
    backgroundColor: "#11120f",
  },
  foilPrice: {
    paddingLeft: "10px",
    borderLeft: "1px solid #34362f",
  },
  detailFoilPrice: {
    paddingLeft: "16px",
  },
  cardIcon: {
    width: "9px",
    height: "13px",
    border: "1px solid #f4f1e8",
    borderRadius: "1.5px",
    backgroundColor: "#f4f1e8",
    boxShadow: "1px 1px 0 rgba(0, 0, 0, 0.45)",
  },
  foilCardIcon: {
    borderColor: "#e1ded5",
    backgroundColor: "#73d4c4",
    backgroundImage:
      "linear-gradient(135deg, #ff7b86 0%, #ffd66b 29%, #68d9ad 51%, #73b7ff 74%, #d59bff 100%)",
    boxShadow: "0 0 7px rgba(115, 183, 255, 0.22), 1px 1px 0 rgba(0, 0, 0, 0.45)",
  },
  detailCardIcon: {
    width: "13px",
    height: "18px",
    borderRadius: "2px",
  },
  value: {
    margin: 0,
    color: "#e1ded5",
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "0.015em",
    lineHeight: 1.2,
  },
  detailValue: {
    color: "#f4f1e8",
    fontSize: "16px",
  },
});
