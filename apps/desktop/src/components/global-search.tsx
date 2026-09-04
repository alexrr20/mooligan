import * as stylex from "@stylexjs/stylex";
import { motion, useAnimationControls, useReducedMotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { colors } from "../styles/tokens.stylex.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
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

      if (document.activeElement === input) {
        input?.blur();
        return;
      }

      input?.focus();
      input?.select();
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [reduceMotion, shortcutControls]);

  return (
    <div {...stylex.props(styles.search)} data-window-no-drag>
      <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m19.5 19.5-3.9-3.9" />
      </svg>
      <Input
        ref={inputRef}
        aria-label="Search Mooligan"
        aria-keyshortcuts="Meta+K"
        placeholder="Search cards, decks, and collection"
        spellCheck={false}
        style={styles.input}
        type="search"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
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
          <Button
            aria-label="Clear search"
            disabled={!query}
            size="icon-xs"
            style={styles.clearButton}
            type="button"
            variant="ghost"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            <svg {...stylex.props(styles.clearIcon)} aria-hidden="true" viewBox="0 0 12 12">
              <path d="m3 3 6 6M9 3 3 9" />
            </svg>
          </Button>
        </motion.span>
      </span>
    </div>
  );
}

const styles = stylex.create({
  search: {
    width: "min(400px, calc(100% - 260px))",
    height: "32px",
    position: "absolute",
    left: "50%",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingInline: "10px",
    borderRadius: "9px",
    transform: "translateX(-50%)",
    transition: "border-color 140ms ease, box-shadow 140ms ease",
    ":focus-within": {
      backgroundColor: "#121310",
      borderColor: colors.accent,
    },
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
