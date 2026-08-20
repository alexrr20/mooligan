import type { CatalogSetSymbolDescriptor } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import {
  catalogSetSymbolAccessibleName,
  catalogSetSymbolFallback,
  catalogSetSymbolUrl,
} from "./catalog-set-symbol-display";

type CatalogSetSymbolProps = {
  code: string;
  size?: "small" | "large";
  symbol: CatalogSetSymbolDescriptor;
};

export function CatalogSetSymbol({ code, size = "small", symbol }: CatalogSetSymbolProps) {
  const [failedSetId, setFailedSetId] = useState<string>();
  const failed = failedSetId === symbol.setId;

  return (
    <span
      {...stylex.props(styles.frame, size === "large" && styles.frameLarge)}
      aria-label={catalogSetSymbolAccessibleName(code)}
      role="img"
    >
      {failed ? (
        <span {...stylex.props(styles.fallback)} aria-hidden="true">
          {catalogSetSymbolFallback(code)}
        </span>
      ) : (
        <img
          {...stylex.props(styles.image)}
          alt=""
          aria-hidden="true"
          src={catalogSetSymbolUrl(symbol)}
          onError={() => setFailedSetId(symbol.setId)}
        />
      )}
    </span>
  );
}

const styles = stylex.create({
  frame: {
    width: "38px",
    height: "38px",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    border: "1px solid #34362f",
    borderRadius: "50%",
    color: "#a6a89d",
    backgroundColor: "#171914",
  },
  frameLarge: {
    width: "68px",
    height: "68px",
  },
  image: {
    width: "58%",
    height: "58%",
    display: "block",
    objectFit: "contain",
    filter: "invert(91%) sepia(5%) saturate(164%) hue-rotate(28deg) brightness(86%)",
  },
  fallback: {
    fontSize: "7px",
    fontWeight: 600,
    letterSpacing: "0.07em",
  },
});
