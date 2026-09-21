import type { Deck } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotionConfig } from "motion/react";

import { ManaSymbol } from "../cards/oracle-text";

export function DeckColors({ deck, compact = false }: { deck: Deck; compact?: boolean }) {
  const reduceMotion = useReducedMotionConfig() ?? false;
  const commanders = deck.entries.filter(({ section }) => section === "commander");
  const entries = commanders.length
    ? commanders
    : deck.entries.filter(({ section }) => section !== "maybeboard");
  const ids = [...new Set(entries.map(({ printingId }) => printingId))].sort();
  const { data: colors } = useQuery({
    queryKey: ["catalog", "colors", ids],
    queryFn: () => window.catalog.colors(ids),
    enabled: ids.length > 0,
    retry: 1,
    staleTime: Infinity,
  });
  const ready = colors != null;
  const identity = new Set(colors);
  const symbols = (["W", "U", "B", "R", "G"] as const).filter((color) => identity.has(color));

  return (
    <span
      role="group"
      aria-label="Deck colors"
      {...stylex.props(styles.colors, compact && styles.compact)}
    >
      <AnimatePresence initial={false} mode="wait">
        {ready ? (
          <motion.span
            key={`${deck.id}:${symbols.join("")}`}
            {...stylex.props(styles.symbols, compact && styles.compactSymbols)}
            initial={{
              opacity: 0,
              transform: reduceMotion ? "none" : "translateY(8px) scale(0.9)",
              filter: reduceMotion ? "none" : "blur(2px)",
            }}
            animate={{
              opacity: 1,
              transform: reduceMotion ? "none" : "translateY(0px) scale(1)",
              filter: reduceMotion ? "none" : "blur(0px)",
            }}
            exit={{
              opacity: 0,
              transform: reduceMotion ? "none" : "translateY(-6px) scale(0.9)",
              filter: reduceMotion ? "none" : "blur(2px)",
              transition: { duration: 0.15 },
            }}
            transition={{ duration: reduceMotion ? 0.15 : 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {(symbols.length ? symbols : ["C"]).map((color) => (
              <ManaSymbol
                key={color}
                token={`{${color}}`}
                className={stylex.props(compact && styles.compactSymbol).className}
              />
            ))}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

const styles = stylex.create({
  colors: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontSize: "12px",
  },
  symbols: { display: "inline-flex", alignItems: "center", gap: "4px" },
  compact: { marginLeft: "auto", fontSize: "10px" },
  compactSymbols: { gap: 0 },
  compactSymbol: { marginLeft: "-2px", ":first-child": { marginLeft: 0 } },
});
