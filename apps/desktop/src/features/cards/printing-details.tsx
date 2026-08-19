import type { CatalogSelectedPrinting } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";

import { PrintingPrices } from "./printing-prices";

type PrintingDetailsProps = {
  printing: CatalogSelectedPrinting;
};

export function PrintingDetails({ printing }: PrintingDetailsProps) {
  const rows = printingRows(printing);

  return (
    <section {...stylex.props(styles.section)} aria-label="Selected printing">
      <PrintingPrices variant="detail" />
      <dl {...stylex.props(styles.details)}>
        {rows.map((row) => (
          <div {...stylex.props(styles.detail)} key={row.label}>
            <dt {...stylex.props(styles.term)}>{row.label}</dt>
            <dd {...stylex.props(styles.value)}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function printingRows(printing: CatalogSelectedPrinting) {
  return [
    { label: "Set", value: `${printing.setName} (${printing.setCode.toUpperCase()})` },
    { label: "Collector no.", value: printing.collectorNumber },
    { label: "Rarity", value: titleCase(printing.rarity) },
    printing.releasedOn
      ? { label: "Released", value: formatReleaseDate(printing.releasedOn) }
      : null,
    printing.language ? { label: "Language", value: languageName(printing.language) } : null,
    printing.artists?.length
      ? {
          label: printing.artists.length > 1 ? "Artists" : "Artist",
          value: printing.artists.join(" · "),
        }
      : null,
    printing.finishes?.length
      ? { label: "Finishes", value: printing.finishes.map(finishName).join(" · ") }
      : null,
    printing.isPromo ? { label: "Printing", value: "Promo" } : null,
    printing.isDigital ? { label: "Medium", value: "Digital" } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
}

function formatReleaseDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      }).format(date);
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function languageName(value: string) {
  const code = value.toLowerCase();
  if (code === "ph") {
    return "Phyrexian";
  }
  try {
    return (
      languageNames.of(code === "zhs" ? "zh-Hans" : code === "zht" ? "zh-Hant" : code) ?? value
    );
  } catch {
    return value.toUpperCase();
  }
}

function finishName(value: string) {
  return value === "nonfoil" ? "Nonfoil" : titleCase(value);
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = stylex.create({
  section: {
    marginTop: "46px",
    borderTop: "1px solid #55584f",
  },
  details: {
    margin: "1px 0 0",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "1px",
    borderBottom: "1px solid #34362f",
    backgroundColor: "#34362f",
  },
  detail: {
    minHeight: "72px",
    padding: "14px 16px",
    display: "grid",
    alignContent: "center",
    gap: "7px",
    backgroundColor: "#11120f",
  },
  term: {
    margin: 0,
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.1em",
    lineHeight: 1.3,
    textTransform: "uppercase",
  },
  value: {
    margin: 0,
    color: "#d7d5cc",
    fontSize: "10px",
    lineHeight: 1.45,
    overflowWrap: "anywhere",
  },
});
