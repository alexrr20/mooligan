import * as stylex from "@stylexjs/stylex";
import { useReducedMotionConfig } from "motion/react";

import { colors } from "../styles/tokens.stylex.js";

const CARD_COUNT = 7;
const CENTER_CARD_INDEX = Math.floor(CARD_COUNT / 2);
const CARD_OUTLINE =
  "M4 .75C2.2 .75.75 2.2.75 4C.75 14 .75 27 .75 37C.75 38.8 2.2 40.25 4 40.25C10 40.25 18 40.25 24 40.25C25.8 40.25 27.25 38.8 27.25 37C27.25 27 27.25 14 27.25 4C27.25 2.2 25.8.75 24 .75C18 .75 10 .75 4 .75Z";
const CARD_FRAME =
  "M6 4.25C5.03 4.25 4.25 5.03 4.25 6C4.25 15.67 4.25 25.33 4.25 35C4.25 35.97 5.03 36.75 6 36.75C10 36.75 18 36.75 22 36.75C22.97 36.75 23.75 35.97 23.75 35C23.75 25.33 23.75 15.67 23.75 6C23.75 5.03 22.97 4.25 22 4.25C18 4.25 10 4.25 6 4.25Z";
const CARD_MARK =
  "M14 14.5C11.8 14.5 10.5 17.1 10.5 20.5C10.5 23.9 11.8 26.5 14 26.5C16.2 26.5 17.5 23.9 17.5 20.5C17.5 17.1 16.2 14.5 14 14.5Z";
const cardFlip = stylex.keyframes({
  "0%": {
    opacity: 0.62,
    transform: "perspective(160px) rotateY(0deg)",
  },
  "100%": {
    opacity: 0.62,
    transform: "perspective(160px) rotateY(360deg)",
  },
});
export function CardLoadingIndicator({ label = "Loading" }: { label?: string }) {
  const reduceMotion = useReducedMotionConfig() ?? false;

  return (
    <div {...stylex.props(styles.root)} aria-live="polite" role="status">
      <span {...stylex.props(styles.cards)} aria-hidden="true">
        {Array.from({ length: CARD_COUNT }, (_, index) => {
          const animationDelay = index * 0.075;
          const animationStyle = reduceMotion
            ? undefined
            : { animationDelay: `${animationDelay}s` };

          return (
            <span
              key={index}
              {...stylex.props(
                styles.card,
                reduceMotion ? styles.staticCard : styles.animatedCard,
                reduceMotion && index === CENTER_CARD_INDEX && styles.staticCenterCard,
              )}
              style={animationStyle}
            >
              <svg {...stylex.props(styles.cardGraphic)} aria-hidden="true" viewBox="0 0 28 41">
                <path {...stylex.props(styles.cardSurface)} d={CARD_OUTLINE} />
                <path {...stylex.props(styles.cardFrame)} d={CARD_FRAME} />
                <path {...stylex.props(styles.cardMark)} d={CARD_MARK} />
              </svg>
            </span>
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
    gap: "8px",
    perspective: "320px",
  },
  card: {
    width: "28px",
    height: "41px",
    flex: "0 0 auto",
    display: "block",
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
  cardGraphic: {
    width: "100%",
    height: "100%",
    display: "block",
    overflow: "visible",
    filter: "drop-shadow(0 5px 7px rgba(0, 0, 0, 0.32))",
  },
  cardSurface: {
    fill: "#22251f",
    stroke: "#6a6d63",
    strokeWidth: "1.5px",
  },
  cardFrame: {
    fill: "none",
    stroke: "#494c43",
    strokeWidth: "1px",
  },
  cardMark: {
    fill: "none",
    stroke: colors.accent,
    strokeWidth: "1.25px",
    opacity: 0.86,
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
