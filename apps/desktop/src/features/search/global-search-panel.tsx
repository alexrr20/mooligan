import { Autocomplete } from "@base-ui/react/autocomplete";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { PrintingImage } from "../cards/printing-image";
import type { GlobalSearchGroup, GlobalSearchResult } from "./global-search-results";

export function GlobalSearchPanel({
  hasQuery,
  hasHistory,
  loading,
  error,
  onSelect,
  onSearchAll,
  onClearHistory,
  onRetry,
}: {
  hasQuery: boolean;
  hasHistory: boolean;
  loading: boolean;
  error: string;
  onSelect: (result: GlobalSearchResult) => void;
  onSearchAll: () => void;
  onClearHistory: () => void;
  onRetry: () => void;
}) {
  return (
    <Autocomplete.Positioner {...stylex.props(styles.positioner)} sideOffset={8} align="center">
      <Autocomplete.Popup {...stylex.props(styles.popup)} finalFocus={false} data-window-no-drag>
        <div {...stylex.props(styles.header)}>
          <h2 {...stylex.props(styles.title)}>{hasQuery ? "Search results" : "Recent searches"}</h2>
          <Autocomplete.Status {...stylex.props(styles.loading)}>
            {hasQuery && loading ? "Searching…" : null}
          </Autocomplete.Status>
          {!hasQuery && hasHistory ? (
            <Button variant="ghost" size="sm" style={styles.clearHistory} onClick={onClearHistory}>
              Clear all
            </Button>
          ) : null}
        </div>
        {hasQuery && error && !loading ? (
          <div {...stylex.props(styles.status)} role="alert">
            {error}
          </div>
        ) : null}
        {hasQuery && error && !loading ? (
          <Button variant="ghost" size="sm" style={styles.retry} onClick={onRetry}>
            Retry search
          </Button>
        ) : null}
        <Autocomplete.Empty {...stylex.props(styles.empty)}>
          {hasQuery ? (
            !loading && !error ? (
              <>No matches. Try a card name, deck name, or Scryfall query.</>
            ) : null
          ) : (
            <>
              <span {...stylex.props(styles.emptyTitle)}>Your searches will appear here</span>
              Find a card, deck, or something in your Collection to get started.
            </>
          )}
        </Autocomplete.Empty>
        <Autocomplete.List {...stylex.props(styles.list)}>
          {(group: GlobalSearchGroup) => (
            <Autocomplete.Group key={group.label} items={group.items}>
              {hasQuery ? (
                <Autocomplete.GroupLabel {...stylex.props(styles.groupLabel)}>
                  {group.label}
                </Autocomplete.GroupLabel>
              ) : null}
              <Autocomplete.Collection>
                {(item: GlobalSearchResult) => (
                  <Autocomplete.Item
                    key={`${item.kind}:${item.id}`}
                    {...stylex.props(styles.item)}
                    value={item}
                    onClick={(event) => {
                      event.preventBaseUIHandler();
                      onSelect(item);
                    }}
                  >
                    <ResultThumbnail item={item} />
                    <span {...stylex.props(styles.copy)}>
                      <span {...stylex.props(styles.label)}>{item.label}</span>
                      <span {...stylex.props(styles.description)}>{item.description}</span>
                    </span>
                  </Autocomplete.Item>
                )}
              </Autocomplete.Collection>
            </Autocomplete.Group>
          )}
        </Autocomplete.List>
        {hasQuery ? (
          <Button variant="ghost" style={styles.allResults} onClick={onSearchAll}>
            All card results
            <span aria-hidden="true">↗</span>
          </Button>
        ) : null}
      </Autocomplete.Popup>
    </Autocomplete.Positioner>
  );
}

function ResultThumbnail({ item }: { item: GlobalSearchResult }) {
  const [failed, setFailed] = useState(false);
  return (
    <span {...stylex.props(styles.thumbnail)} aria-hidden="true">
      {item.image ? (
        <PrintingImage
          image={item.image}
          failed={failed}
          placeholder={<ResultIcon kind={item.kind} />}
          onImageError={() => setFailed(true)}
        />
      ) : (
        <ResultIcon kind={item.kind} />
      )}
    </span>
  );
}

function ResultIcon({ kind }: { kind: GlobalSearchResult["kind"] }) {
  return (
    <svg {...stylex.props(styles.icon)} viewBox="0 0 24 24" fill="none">
      {kind === "recent" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v5l3 2" />
        </>
      ) : kind === "deck" ? (
        <>
          <path d="m12 3 9 4.75-9 4.75-9-4.75L12 3Z" />
          <path d="m3 12 9 4.75L21 12M3 16.25 12 21l9-4.75" />
        </>
      ) : (
        <>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8M8 17h5" />
        </>
      )}
    </svg>
  );
}

const styles = stylex.create({
  positioner: { zIndex: 21, outline: "none" },
  popup: {
    width: "var(--anchor-width)",
    maxWidth: "calc(100vw - 24px)",
    maxHeight: "min(560px, var(--available-height))",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    paddingBlock: "6px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#353730",
    borderRadius: "12px",
    backgroundColor: "#1b1c19",
    color: "#f4f1e8",
    boxShadow: "0 20px 60px rgb(0 0 0 / 40%)",
    outline: "none",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    minHeight: "46px",
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: "14px", fontWeight: 600, letterSpacing: "-0.02em" },
  clearHistory: { height: "24px", padding: "0 6px", color: "#a4a79b", fontSize: "11px" },
  loading: {
    marginLeft: "auto",
    flexShrink: 0,
    color: "#a4a79b",
    fontSize: "12px",
    lineHeight: 1.5,
    whiteSpace: "nowrap",
  },
  retry: { alignSelf: "flex-start", margin: "0 16px 12px", fontSize: "12px" },
  status: {
    padding: "0 16px 12px",
    color: "#a4a79b",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  empty: {
    padding: "18px 20px 28px",
    color: "#a4a79b",
    fontSize: "12px",
    lineHeight: 1.6,
    textAlign: "center",
    ":empty": { display: "none" },
  },
  emptyTitle: { display: "block", marginBottom: "5px", fontSize: "13px", color: "#e9e7df" },
  list: {
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollPaddingBlock: "6px",
    padding: "0 6px",
    ":empty": { display: "none" },
  },
  groupLabel: {
    padding: "12px 10px 6px",
    color: "#929689",
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minHeight: "66px",
    padding: "7px 10px",
    borderRadius: "7px",
    cursor: "pointer",
    outline: "none",
    "[data-highlighted]": { backgroundColor: "#2b2e26" },
  },
  thumbnail: {
    width: "36px",
    height: "50px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "4px",
    backgroundColor: "#252720",
    color: "#a4a79b",
    overflow: "hidden",
  },
  icon: {
    width: "20px",
    height: "20px",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  copy: { display: "grid", minWidth: 0, gap: "5px" },
  label: {
    color: "#f4f1e8",
    fontSize: "13px",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: "#a4a79b",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  allResults: {
    flexShrink: 0,
    justifyContent: "space-between",
    height: "40px",
    margin: "6px 6px 0",
    paddingInline: "10px",
    borderRadius: "6px",
    color: "#b7baaf",
    fontSize: "12px",
  },
});
