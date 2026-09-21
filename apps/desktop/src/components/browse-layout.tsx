import * as stylex from "@stylexjs/stylex";

import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { colors } from "../styles/tokens.stylex.js";

export function BrowseViewToggle({
  grid,
  label,
  onChange,
}: {
  grid: boolean;
  label: string;
  onChange: (grid: boolean) => void;
}) {
  return (
    <ToggleGroup
      aria-label={label}
      spacing={1}
      style={browseStyles.viewGroup}
      value={[grid ? "grid" : "list"]}
      onValueChange={(values) => {
        if (values[0]) onChange(values[0] === "grid");
      }}
    >
      <ToggleGroupItem
        aria-label="List view"
        title="List view"
        value="list"
        style={browseStyles.viewItem}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M7 5h10M7 10h10M7 15h10M3 5h.01M3 10h.01M3 15h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label="Grid view"
        title="Grid view"
        value="grid"
        style={browseStyles.viewItem}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="12" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="3" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <rect x="12" y="12" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export const browseStyles = stylex.create({
  page: { display: "grid", gap: "16px", minWidth: 0 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "24px",
    fontWeight: 500,
    letterSpacing: "-.025em",
    lineHeight: 1.15,
  },
  description: {
    margin: "6px 0 0",
    color: "#989b92",
    fontSize: "13px",
    lineHeight: 1.4,
    maxWidth: "620px",
  },
  toolbar: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 12px" },
  resultsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "8px",
    marginBlock: "12px 8px",
  },
  count: {
    margin: 0,
    color: "#989b92",
    fontSize: "13px",
    lineHeight: 1.5,
    fontVariantNumeric: "tabular-nums",
  },
  select: {
    borderWidth: 0,
    boxShadow: "none",
    backgroundColor: "#1b1c1b",
    height: "28px",
    maxWidth: "260px",
    fontSize: "13px",
  },
  viewGroup: { padding: "2px", backgroundColor: "#171817", borderRadius: "7px" },
  viewItem: {
    borderWidth: 0,
    width: "30px",
    height: "28px",
    color: "#85887f",
    "[data-pressed]": { color: "#f4f1e8", backgroundColor: "#30322e" },
  },
  link: {
    color: colors.accent,
    textDecoration: "none",
    fontSize: "13px",
    ":hover": { textDecoration: "underline" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "4px" },
  },
});
