import { Autocomplete } from "@base-ui/react/autocomplete";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { motion, useAnimationControls, useReducedMotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { GlobalSearchPanel } from "../features/search/global-search-panel";
import type {
  GlobalSearchGroup,
  GlobalSearchResult,
} from "../features/search/global-search-results";
import {
  addRecentSearch,
  readRecentSearches,
  writeRecentSearches,
} from "../features/search/recent-searches";
import { useGlobalSearchResults } from "../features/search/use-global-search-results";
import { useWorkspaceRuntime } from "../features/workspace/workspace-runtime-context";
import { colors } from "../styles/tokens.stylex.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function GlobalSearch() {
  const { runtime } = useWorkspaceRuntime();
  return <WorkspaceSearch key={runtime.workspaceId} workspaceId={runtime.workspaceId} />;
}

function WorkspaceSearch({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(() => readRecentSearches(window.localStorage, workspaceId));
  const trimmedQuery = query.trim();
  const results = useGlobalSearchResults(trimmedQuery, open, workspaceId);
  const groups: GlobalSearchGroup[] = trimmedQuery
    ? results.groups
    : recent.length
      ? [
          {
            label: "Recent searches",
            items: recent.map((label) => ({
              id: label,
              kind: "recent",
              label,
              description: "Search again",
              image: null,
            })),
          },
        ]
      : [];
  const reduceMotion = useReducedMotionConfig() ?? false;
  const shortcutControls = useAnimationControls();
  const shortcutState = reduceMotion
    ? { opacity: query ? 0 : 1 }
    : {
        opacity: query ? 0 : 1,
        filter: query ? "blur(2px)" : "blur(0px)",
        transform: query ? "scale(0.86)" : "scale(1)",
      };
  const clearState = reduceMotion
    ? { opacity: query ? 1 : 0 }
    : {
        opacity: query ? 1 : 0,
        filter: query ? "blur(0px)" : "blur(2px)",
        transform: query ? "scale(1)" : "scale(0.72)",
      };
  const controlTransition = {
    duration: reduceMotion ? 0.1 : 0.26,
    ease: [0.19, 1, 0.22, 1],
  } as const;

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!event.metaKey || event.altKey || event.ctrlKey || event.key.toLowerCase() !== "k") {
        return;
      }

      event.preventDefault();
      void shortcutControls.start({
        backgroundColor: ["#191a17", "#292b25", "#191a17"],
        borderColor: ["#343730", "#55594f", "#343730"],
        color: ["#73776d", "#b7baaf", "#73776d"],
        transition: {
          duration: reduceMotion ? 0.12 : 0.24,
          ease: [0.25, 0.46, 0.45, 0.94],
          times: [0, 0.35, 1],
        },
      });
      const input = inputRef.current;

      if (open) {
        setOpen(false);
        input?.blur();
        return;
      }

      input?.focus();
      input?.select();
      setOpen(true);
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [open, reduceMotion, shortcutControls]);

  function saveHistory(next: string[]) {
    setRecent(next);
    writeRecentSearches(window.localStorage, workspaceId, next);
  }

  function finishSearch(value: string) {
    saveHistory(addRecentSearch(recent, value));
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function searchAll(value: string) {
    if (!value.trim()) return;
    finishSearch(value);
    void navigate({ to: "/search", search: { query: value.trim(), uniqueCards: true } });
  }

  function selectResult(result: GlobalSearchResult) {
    if (result.kind === "recent") {
      setQuery(result.label);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }
    finishSearch(trimmedQuery);
    if (result.kind === "deck") {
      void navigate({ to: "/decks", search: { deck: result.id } });
    } else if (result.kind === "collection") {
      void navigate({ to: "/collection", search: { query: result.label } });
    } else {
      void navigate({ to: "/cards/$printingId", params: { printingId: result.id } });
    }
  }

  return (
    <Autocomplete.Root
      items={groups}
      value={query}
      open={open}
      openOnInputClick
      modal={false}
      filter={null}
      itemToStringValue={(item) => item.label}
      onValueChange={(value, details) => {
        if (details.reason !== "item-press") setQuery(value);
      }}
      onOpenChange={(nextOpen, details) => {
        setOpen(nextOpen);
        if (!nextOpen && details.reason === "escape-key") inputRef.current?.blur();
      }}
    >
      <Autocomplete.InputGroup {...stylex.props(styles.search)} data-window-no-drag>
        <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m19.5 19.5-3.9-3.9" />
        </svg>
        <Autocomplete.Input
          ref={inputRef}
          aria-label="Search Mooligan"
          aria-keyshortcuts="Meta+K"
          placeholder="Search cards, decks, and collection"
          spellCheck={false}
          render={<Input style={styles.input} />}
          type="search"
          maxLength={500}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              !event.currentTarget.getAttribute("aria-activedescendant")
            ) {
              event.preventDefault();
              searchAll(trimmedQuery);
            }
          }}
        />
        <span {...stylex.props(styles.trailingControl)}>
          <motion.span
            {...stylex.props(styles.controlState)}
            animate={shortcutState}
            aria-hidden={query.length > 0}
            initial={false}
            style={{ transformOrigin: "50% 50%" }}
            transition={controlTransition}
          >
            <motion.kbd
              {...stylex.props(styles.shortcut)}
              animate={shortcutControls}
              aria-hidden="true"
              initial={false}
            >
              ⌘K
            </motion.kbd>
          </motion.span>
          <motion.span
            {...stylex.props(styles.controlState)}
            animate={clearState}
            aria-hidden={!query}
            initial={false}
            style={{ transformOrigin: "50% 50%" }}
            transition={controlTransition}
          >
            <Autocomplete.Clear
              aria-label="Clear search"
              disabled={!query}
              keepMounted
              render={<Button size="icon-xs" style={styles.clearButton} variant="ghost" />}
            >
              <svg {...stylex.props(styles.clearIcon)} aria-hidden="true" viewBox="0 0 12 12">
                <path d="m3 3 6 6M9 3 3 9" />
              </svg>
            </Autocomplete.Clear>
          </motion.span>
        </span>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal container={document.getElementById("root")}>
        <Autocomplete.Backdrop {...stylex.props(styles.overlay)} data-window-no-drag />
        <GlobalSearchPanel
          hasQuery={Boolean(trimmedQuery)}
          hasHistory={recent.length > 0}
          loading={results.loading}
          error={results.error}
          onSelect={selectResult}
          onSearchAll={() => searchAll(trimmedQuery)}
          onClearHistory={() => saveHistory([])}
          onRetry={results.retry}
        />
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}

const styles = stylex.create({
  search: {
    width: "min(400px, calc(100% - 260px))",
    height: "32px",
    position: "absolute",
    zIndex: 20,
    left: 0,
    right: 0,
    marginInline: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingInline: "10px",
    borderRadius: "9px",
    transition: "border-color 140ms ease, box-shadow 140ms ease",
    ":focus-within": {
      backgroundColor: "#121310",
      borderColor: colors.accent,
    },
  },
  overlay: {
    position: "fixed",
    zIndex: 19,
    inset: 0,
    backgroundColor: "rgb(0 0 0 / 25%)",
  },
  icon: {
    width: "14px",
    height: "14px",
    flexShrink: 0,
    color: "#7f8278",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pointerEvents: "none",
  },
  input: {
    height: "30px",
    paddingInline: 0,
    paddingBlock: 0,
    borderWidth: 0,
    borderRadius: 0,
    color: "transparent",
    caretColor: "#e9e7df",
    backgroundColor: "transparent",
    fontSize: "12px",
    fontWeight: "500",
    lineHeight: 1,
    letterSpacing: "-0.02rem",
    outline: "none",
    boxShadow: "none",
    appearance: "none",
    textShadow: "0 1px 0 #e9e7df",
    "::placeholder": {
      color: "transparent",
      fontSize: "11px",
      textShadow: "0 1px 0 #74776e",
      textTransform: "uppercase",
      fontWeight: "600",
    },
    "::-webkit-search-cancel-button": {
      display: "none",
      appearance: "none",
    },
    ":focus-visible": {
      borderColor: "transparent",
      boxShadow: "none",
    },
  },
  shortcut: {
    minWidth: "27px",
    height: "20px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#343730",
    borderRadius: "5px",
    color: "#73776d",
    backgroundColor: "#191a17",
    fontFamily: "inherit",
    fontSize: "9px",
    lineHeight: 1,
  },
  trailingControl: {
    width: "27px",
    height: "20px",
    position: "relative",
    flexShrink: 0,
  },
  controlState: {
    width: "27px",
    height: "20px",
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    transformOrigin: "center",
  },
  clearButton: {
    width: "27px",
    height: "20px",
    padding: 0,
    borderWidth: 0,
    borderColor: "transparent",
    color: "#73776d",
    backgroundColor: "transparent",
    cursor: "pointer",
    ":hover": {
      borderColor: "transparent",
      color: "#e9e7df",
      backgroundColor: "transparent",
    },
  },
  clearIcon: {
    width: "10px",
    height: "10px",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
  },
});
