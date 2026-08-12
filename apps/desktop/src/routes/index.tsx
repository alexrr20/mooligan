import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link } from "@tanstack/react-router";

import { Page } from "../components/page";
import { colors } from "../styles/tokens.stylex.js";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <Page
      description="A quiet place to catalog cards, shape decks, and keep the next idea within reach."
      eyebrow="Welcome back"
      number="01"
      title="Keep good cards in play."
    >
      <section {...stylex.props(styles.quickGrid)} aria-label="Quick starts">
        <Link {...stylex.props(styles.quickLink, styles.quickLinkAccent)} to="/collection">
          <span {...stylex.props(styles.cardMeta)}>02 / Collection</span>
          <strong {...stylex.props(styles.cardTitle)}>Catalog what you own.</strong>
          <span {...stylex.props(styles.arrow)} aria-hidden="true">
            ↗
          </span>
        </Link>
        <Link {...stylex.props(styles.quickLink)} to="/decks">
          <span {...stylex.props(styles.cardMeta)}>03 / Decks</span>
          <strong {...stylex.props(styles.cardTitle)}>Shape the next build.</strong>
          <span {...stylex.props(styles.arrow)} aria-hidden="true">
            ↗
          </span>
        </Link>
        <Link {...stylex.props(styles.quickLink)} to="/search">
          <span {...stylex.props(styles.cardMeta)}>06 / Search</span>
          <strong {...stylex.props(styles.cardTitle)}>Find a card quickly.</strong>
          <span {...stylex.props(styles.arrow)} aria-hidden="true">
            ↗
          </span>
        </Link>
      </section>
    </Page>
  );
}

const styles = stylex.create({
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
  },
  quickLink: {
    minHeight: "190px",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    border: "1px solid #34362f",
    borderRadius: "3px",
    color: "#f4f1e8",
    backgroundColor: "rgba(255, 255, 255, 0.025)",
    textDecoration: "none",
    transition: "transform 180ms ease, border-color 180ms ease, background-color 180ms ease",
    ":hover": {
      transform: "translateY(-3px)",
      borderColor: "#696c63",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "3px",
    },
  },
  quickLinkAccent: {
    borderColor: colors.accent,
    color: "#f4f1e8",
    backgroundColor: "#141512",
    ":hover": {
      borderColor: colors.accent,
      backgroundColor: "#292b26",
    },
  },
  cardMeta: {
    fontSize: "8px",
    letterSpacing: "0.12em",
    opacity: 0.66,
    textTransform: "uppercase",
  },
  cardTitle: {
    maxWidth: "180px",
    fontSize: {
      default: "23px",
      "@media (max-width: 820px)": "20px",
    },
    fontWeight: 400,
    letterSpacing: "-0.025em",
    lineHeight: 1.08,
  },
  arrow: {
    alignSelf: "flex-end",
    fontSize: "18px",
  },
});
