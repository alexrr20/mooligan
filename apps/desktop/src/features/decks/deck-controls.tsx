import { deckSectionLabels, deckSections } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../components/ui/number-field";

export const deckSectionOptions = deckSections.map((value) => ({
  value,
  label: value === "commander" ? "Main deck · Commander" : deckSectionLabels[value],
}));

export function DeckQuantity({
  label = "Quantity",
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <NumberField
      min={1}
      max={1_000_000}
      step={1}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      disabled={disabled}
      style={deckStyles.quantity}
    >
      <NumberFieldGroup>
        <NumberFieldDecrement aria-label={`Decrease ${label.toLowerCase()}`}>
          −
        </NumberFieldDecrement>
        <NumberFieldInput aria-label={label} />
        <NumberFieldIncrement aria-label={`Increase ${label.toLowerCase()}`}>
          +
        </NumberFieldIncrement>
      </NumberFieldGroup>
    </NumberField>
  );
}

export const deckStyles = stylex.create({
  page: {
    display: "grid",
    gap: "16px",
    minWidth: 0,
    fontSize: "13px",
    lineHeight: 1.5,
    color: "#f4f1e8",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: { margin: 0, fontSize: "24px", fontWeight: 500, overflowWrap: "anywhere" },
  sectionTitle: { margin: 0, fontSize: "18px", fontWeight: 500 },
  searchField: { flex: "0 1 360px" },
  section: { display: "grid", gap: "16px", minWidth: 0 },
  panel: {
    display: "grid",
    gap: "16px",
    padding: "20px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#34362f",
    borderRadius: "6px",
    minWidth: 0,
  },
  list: { display: "grid", gap: "12px", padding: 0, margin: 0, listStyle: "none" },
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    paddingBlock: "12px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  grow: { flex: "1 1 200px", minWidth: 0, overflowWrap: "anywhere" },
  commanderLabel: { marginInlineStart: "8px", fontSize: "11px", color: "#c4ef8c" },
  link: { color: "#c4ef8c", textDecoration: "underline", textUnderlineOffset: "3px" },
  quantity: { width: "132px" },
  textarea: {
    width: "100%",
    minHeight: "140px",
    padding: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#55584f",
    borderRadius: "4px",
    backgroundColor: "#171915",
    color: "#f4f1e8",
    font: "inherit",
    resize: "vertical",
  },
  notes: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 },
});
