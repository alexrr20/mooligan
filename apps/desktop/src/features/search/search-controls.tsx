import { Input } from "@base-ui/react/input";
import { Switch } from "@base-ui/react/switch";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { colors } from "../../styles/tokens.stylex.js";
import { reconcileCatalogSearchDraft, type UniverseFilter } from "./search-state";

type SearchFormProps = {
  activeQuery: string;
  onSearch: (query: string) => void;
};

export function SearchForm({ activeQuery, onSearch }: SearchFormProps) {
  const [query, setQuery] = useState(activeQuery);
  const previousActiveQuery = useRef(activeQuery);

  useEffect(() => {
    const previousQuery = previousActiveQuery.current;
    previousActiveQuery.current = activeQuery;
    setQuery((draft) => reconcileCatalogSearchDraft(draft, previousQuery, activeQuery));
  }, [activeQuery]);

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
      <Input
        {...stylex.props(styles.searchInput)}
        aria-label="Search cards"
        id="card-search"
        name="query"
        placeholder="Card, set, number, or type"
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
    <Switch.Root
      {...stylex.props(styles.filterToggle)}
      checked={checked}
      onCheckedChange={onChange}
    >
      <span
        {...stylex.props(styles.toggleTrack, checked && styles.toggleTrackActive)}
        aria-hidden="true"
      >
        <Switch.Thumb {...stylex.props(styles.toggleKnob, checked && styles.toggleKnobActive)} />
      </span>
      {label}
    </Switch.Root>
  );
}

type SearchUniverseFilterProps = {
  onChange: (value: UniverseFilter | undefined) => void;
  value: UniverseFilter | undefined;
};

const universeOptions = [
  { label: "All", value: undefined },
  { label: "Within", value: "within" },
  { label: "Beyond", value: "beyond" },
] as const;

export function SearchUniverseFilter({ onChange, value }: SearchUniverseFilterProps) {
  return (
    <div {...stylex.props(styles.viewControl)}>
      <span {...stylex.props(styles.viewLabel)}>Universe</span>
      <div {...stylex.props(styles.viewToggle)} aria-label="Universe" role="group">
        {universeOptions.map((option) => (
          <button
            {...stylex.props(
              styles.viewOption,
              styles.universeOption,
              value === option.value && styles.viewOptionActive,
            )}
            aria-pressed={value === option.value}
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type SearchViewToggleProps = {
  grid: boolean;
  onChange: (grid: boolean) => void;
};

export function SearchViewToggle({ grid, onChange }: SearchViewToggleProps) {
  return (
    <div {...stylex.props(styles.viewControl)}>
      <span {...stylex.props(styles.viewLabel)}>View</span>
      <div {...stylex.props(styles.viewToggle)} aria-label="Card view" role="group">
        <button
          {...stylex.props(styles.viewOption, !grid && styles.viewOptionActive)}
          aria-label="List view"
          aria-pressed={!grid}
          title="List view"
          type="button"
          onClick={() => onChange(false)}
        >
          <svg {...stylex.props(styles.viewIcon)} aria-hidden="true" viewBox="0 0 16 16">
            <path d="M2 3.5h2v2H2zM6 4h8v1H6zM2 7h2v2H2zM6 7.5h8v1H6zM2 10.5h2v2H2zM6 11h8v1H6z" />
          </svg>
        </button>
        <button
          {...stylex.props(styles.viewOption, grid && styles.viewOptionActive)}
          aria-label="Grid view"
          aria-pressed={grid}
          title="Grid view"
          type="button"
          onClick={() => onChange(true)}
        >
          <svg {...stylex.props(styles.viewIcon)} aria-hidden="true" viewBox="0 0 16 16">
            <path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  searchBar: {
    minHeight: "78px",
    display: "flex",
    alignItems: "center",
    borderBottom: "1px solid #34362f",
  },
  searchInput: {
    width: "100%",
    minWidth: 0,
    padding: "13px 0",
    borderWidth: "0 0 1px",
    borderStyle: "solid",
    borderColor: "#55584f",
    borderRadius: 0,
    color: "#f4f1e8",
    backgroundColor: "transparent",
    fontSize: "18px",
    outline: "none",
    "::placeholder": {
      color: "#73766b",
    },
    ":focus": {
      borderColor: colors.accent,
    },
  },
  filterToggle: {
    padding: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    border: 0,
    color: "#a6a89d",
    backgroundColor: "transparent",
    fontSize: "8px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    cursor: "pointer",
    ":hover": {
      color: "#f4f1e8",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "4px",
    },
  },
  toggleTrack: {
    width: "28px",
    height: "16px",
    padding: "2px",
    display: "flex",
    alignItems: "center",
    border: "1px solid #55584f",
    borderRadius: "999px",
    backgroundColor: "#22241f",
    transition: "background-color 160ms ease, border-color 160ms ease",
  },
  toggleTrackActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  toggleKnob: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#a6a89d",
    transform: "translateX(0)",
    transition: "background-color 160ms ease, transform 160ms ease",
  },
  toggleKnobActive: {
    backgroundColor: "#1b1d19",
    transform: "translateX(12px)",
  },
  viewControl: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  viewLabel: {
    color: "#a6a89d",
    fontSize: "8px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  viewToggle: {
    padding: "2px",
    display: "flex",
    gap: "2px",
    border: "1px solid #55584f",
    borderRadius: "3px",
    backgroundColor: "#22241f",
  },
  viewOption: {
    width: "27px",
    height: "23px",
    padding: "5px",
    display: "grid",
    placeItems: "center",
    border: 0,
    borderRadius: "2px",
    color: "#a6a89d",
    backgroundColor: "transparent",
    cursor: "pointer",
    transition: "color 140ms ease, background-color 140ms ease",
    ":hover": {
      color: "#f4f1e8",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  viewOptionActive: {
    color: "#1b1d19",
    backgroundColor: colors.accent,
    ":hover": {
      color: "#1b1d19",
    },
  },
  universeOption: {
    width: "auto",
    minWidth: "42px",
    paddingInline: "7px",
    fontSize: "7px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  viewIcon: {
    width: "13px",
    height: "13px",
    fill: "currentColor",
  },
});
