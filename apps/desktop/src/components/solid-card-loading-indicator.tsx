import * as stylex from "@stylexjs/stylex";
import { useReducedMotionConfig } from "motion/react";

const CARD_COUNT = 7;
const CENTER_CARD_INDEX = Math.floor(CARD_COUNT / 2);
const CARD_STAGGER_MS = 75;
const cardFlip = stylex.keyframes({
  "0%": {
    opacity: 1,
    transform: "perspective(160px) rotateY(0deg)",
  },
  "100%": {
    opacity: 1,
    transform: "perspective(160px) rotateY(360deg)",
  },
});

export function SolidCardLoadingIndicator({
  label = "Loading",
  startOffsetMs = 0,
}: {
  label?: string;
  startOffsetMs?: number;
}) {
  const reduceMotion = useReducedMotionConfig() ?? false;

  return (
    <div {...stylex.props(styles.root)} aria-live="polite" role="status">
      <span {...stylex.props(styles.cards)} aria-hidden="true">
        {Array.from({ length: CARD_COUNT }, (_, index) => {
          const animationDelay = index * CARD_STAGGER_MS - startOffsetMs;
          const animationStyle = reduceMotion
            ? undefined
            : { animationDelay: `${animationDelay}ms` };

          return (
            <span
              key={index}
              {...stylex.props(
                styles.card,
                reduceMotion ? styles.staticCard : styles.animatedCard,
                reduceMotion && index === CENTER_CARD_INDEX && styles.staticCenterCard,
              )}
              style={animationStyle}
            />
          );
        })}
      </span>
      <span {...stylex.props(styles.visuallyHidden)}>{label}</span>
    </div>
  );
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
  },
  cards: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    perspective: "320px",
  },
  card: {
    width: "7px",
    height: "10.5px",
    flex: "0 0 auto",
    display: "block",
    backgroundColor: "#11c565",
    borderRadius: "1px",
    boxShadow: "0 0 2px rgba(17, 197, 101, 0.35)",
    transformOrigin: "center",
    transformStyle: "preserve-3d",
    willChange: "transform, opacity",
  },
  animatedCard: {
    animationName: cardFlip,
    animationDuration: "2.5s",
    animationTimingFunction: "var(--ease-in-out-cubic)",
    animationIterationCount: "infinite",
    animationFillMode: "backwards",
  },
  staticCard: {
    opacity: 0.62,
    transform: "perspective(160px) rotateY(0deg)",
  },
  staticCenterCard: {
    opacity: 1,
  },
  visuallyHidden: {
    width: "1px",
    height: "1px",
    position: "absolute",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
});
