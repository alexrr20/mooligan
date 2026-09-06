import { Tabs } from "@base-ui/react/tabs";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { Input } from "../../components/ui/input";
import { Toggle } from "../../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { colors } from "../../styles/tokens.stylex.js";
import { reconcileCatalogSearchDraft, type UniverseFilter } from "./search-state";

export function SearchModeTabs() {
  return (
    <Tabs.List {...stylex.props(styles.modeTabs)} aria-label="Catalog section">
      <Tabs.Tab {...stylex.props(styles.modeTab)} value="cards">
        Card index
      </Tabs.Tab>
      <Tabs.Tab {...stylex.props(styles.modeTab)} value="upcoming">
        Upcoming
      </Tabs.Tab>
    </Tabs.List>
  );
}

type SearchFormProps = {
  activeQuery: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  id?: string;
  placeholder?: string;
  onSearch: (query: string) => void;
};

export function SearchForm({
  activeQuery,
  ariaLabel = "Search cards",
  autoFocus = true,
  id = "card-search",
  placeholder = "Card name or Scryfall query",
  onSearch,
}: SearchFormProps) {
  const [query, setQuery] = useState(activeQuery);
  const [previousActiveQuery, setPreviousActiveQuery] = useState(activeQuery);

  if (activeQuery !== previousActiveQuery) {
    setPreviousActiveQuery(activeQuery);
    setQuery(reconcileCatalogSearchDraft(query, previousActiveQuery, activeQuery));
  }

  useEffect(() => {
    const nextQuery = query.trim();

    if (nextQuery === activeQuery) {
      return;
    }

    const timeout = window.setTimeout(() => onSearch(nextQuery), 160);
    return () => window.clearTimeout(timeout);
  }, [activeQuery, onSearch, query]);

  return (
    <form
      {...stylex.props(styles.searchBar)}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(query.trim());
      }}
    >
      <svg {...stylex.props(styles.searchIcon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
      <Input
        style={styles.searchInput}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        id={id}
        maxLength={500}
        name="query"
        placeholder={placeholder}
        type="search"
        value={query}
        onValueChange={setQuery}
      />
    </form>
  );
}

type SearchToggleProps = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function SearchToggle({ checked, label, onChange }: SearchToggleProps) {
  return (
    <Toggle pressed={checked} onPressedChange={onChange} style={styles.filterToggle}>
      <span {...stylex.props(styles.toggleMark)} aria-hidden="true">
        {checked ? "✓" : "+"}
      </span>
      {label}
    </Toggle>
  );
}

type SearchUniverseFilterProps = {
  onChange: (value: UniverseFilter | undefined) => void;
  value: UniverseFilter | undefined;
};

const universeOptions = [
  { label: "All universes", value: "all" },
  { label: "Within", value: "within" },
  { label: "Beyond", value: "beyond" },
] as const;

export function SearchUniverseFilter({ onChange, value }: SearchUniverseFilterProps) {
  return (
    <ToggleGroup
      aria-label="Universe"
      spacing={1}
      value={[value ?? "all"]}
      onValueChange={(values) => {
        const next = values[0];
        if (next) onChange(next === "within" || next === "beyond" ? next : undefined);
      }}
    >
      {universeOptions.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} style={styles.universeOption}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const styles = stylex.create({
  modeTabs: {
    display: "flex",
    gap: "4px",
    padding: "4px",
    borderRadius: "10px",
    backgroundColor: "#171817",
  },
  modeTab: {
    padding: "9px 16px",
    borderWidth: 0,
    borderRadius: "7px",
    backgroundColor: "transparent",
    color: "#989b92",
    fontSize: "13px",
    cursor: "pointer",
    "[data-active]": { color: "#f4f1e8", backgroundColor: "#30322e" },
    ":hover": { color: "#f4f1e8" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "3px" },
  },
  searchBar: {
    width: "100%",
    minHeight: "52px",
    paddingInline: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderRadius: "10px",
    backgroundColor: "#1b1c1b",
    ":focus-within": { outline: `2px solid ${colors.accent}`, outlineOffset: "2px" },
  },
  searchInput: {
    height: "50px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontSize: "15px",
    boxShadow: "none",
    ":focus-visible": { boxShadow: "none" },
  },
  searchIcon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
    color: "#85887f",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  filterToggle: {
    height: "32px",
    paddingInline: "10px",
    borderWidth: 0,
    color: "#a6a89d",
    fontSize: "12px",
    gap: "6px",
    "[data-pressed]": { color: colors.accent, backgroundColor: "#13271c" },
  },
  toggleMark: { fontSize: "14px", width: "12px" },
  universeOption: {
    height: "32px",
    borderWidth: 0,
    color: "#989b92",
    fontSize: "12px",
    "[data-pressed]": { color: "#f4f1e8", backgroundColor: "#252724" },
  },
});
