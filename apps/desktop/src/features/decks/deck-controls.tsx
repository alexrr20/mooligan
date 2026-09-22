import { deckSections } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../../components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export const deckSectionOptions = deckSections.map((section) => ({
  ...section,
  label: section.value === "commander" ? "Main deck · Commander" : section.label,
}));

export function DeckSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div {...stylex.props(deckStyles.field)}>
      {hideLabel ? null : <span>{label}</span>}
      <Select<T>
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} size="sm" style={deckStyles.control}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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

export function DeckMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p
      {...stylex.props(deckStyles.message, error && deckStyles.error)}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
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
  toolbar: { display: "flex", alignItems: "end", flexWrap: "wrap", gap: "8px" },
  field: { display: "grid", gap: "4px", minWidth: 0, fontSize: "12px" },
  searchField: { flex: "0 1 360px" },
  control: { height: "28px", fontSize: "13px" },
  fields: { display: "grid", gap: "16px" },
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
  muted: { color: "#a6a89d", margin: 0 },
  commanderLabel: { marginInlineStart: "8px", fontSize: "11px", color: "#c4ef8c" },
  link: { color: "#c4ef8c", textDecoration: "underline", textUnderlineOffset: "3px" },
  message: { margin: 0, color: "#a6a89d", overflowWrap: "anywhere" },
  error: { color: "#ffaaa3" },
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
  dialog: { maxWidth: "min(680px, calc(100% - 32px))", maxHeight: "85vh", overflowY: "auto" },
  notes: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 },
});
