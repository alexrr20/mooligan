import * as stylex from "@stylexjs/stylex";

import { OracleText } from "./oracle-text";

export function ManaCost({ value }: { value: string }) {
  return (
    <span {...stylex.props(styles.cost)} aria-label={`Mana cost ${value}`}>
      <OracleText className={stylex.props(styles.symbols).className} text={value} />
    </span>
  );
}

const styles = stylex.create({
  cost: {
    minHeight: "28px",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    color: "#f4f1e8",
    fontSize: "17px",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  },
  symbols: {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
  },
});
