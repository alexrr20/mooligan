import * as stylex from "@stylexjs/stylex";
import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig } from "motion/react";

import { CatalogSetup } from "../components/catalog-setup";
import { usePreferences } from "../features/preferences/use-preferences";
import { colors } from "../styles/tokens.stylex.js";

export const Route = createRootRoute({
  component: AppShell,
});

const navigation = [
  { to: "/", label: "Home", number: "01" },
  { to: "/collection", label: "Collection", number: "02" },
  { to: "/decks", label: "Decks", number: "03" },
  { to: "/sets", label: "Sets", number: "04" },
  { to: "/lists", label: "Lists", number: "05" },
  { to: "/search", label: "Search", number: "06" },
  { to: "/settings", label: "Settings", number: "07" },
] as const;
const reducedMotionByPreference = {
  full: "never",
  reduced: "always",
  system: "user",
} as const;

function AppShell() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { preferences } = usePreferences();
  const reducedMotion = reducedMotionByPreference[preferences.motion];

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div {...stylex.props(styles.app)}>
        <header {...stylex.props(styles.chrome)} data-window-drag-region>
          <span {...stylex.props(styles.wordmark)}>Mooligan</span>
        </header>

        <aside {...stylex.props(styles.sidebar)}>
          <div>
            <p {...stylex.props(styles.sectionLabel)}>Workspace</p>
            <nav {...stylex.props(styles.navigation)} aria-label="Primary" data-window-no-drag>
              {navigation.map((item) => (
                <Link
                  key={item.to}
                  {...stylex.props(styles.navItem)}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{
                    style: {
                      color: "#1b1d19",
                      backgroundColor: colors.accent,
                    },
                  }}
                  to={item.to}
                >
                  <span {...stylex.props(styles.navNumber)}>{item.number}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        <main
          {...stylex.props(styles.main)}
          data-scroll-restoration-id="mooligan-main"
          data-window-no-drag
        >
          <motion.div
            key={pathname}
            {...stylex.props(styles.route)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <CatalogSetup />
    </MotionConfig>
  );
}

const styles = stylex.create({
  app: {
    height: "100vh",
    display: "grid",
    gridTemplateColumns: {
      default: "238px minmax(0, 1fr)",
      "@media (max-width: 820px)": "190px minmax(0, 1fr)",
    },
    gridTemplateRows: "52px minmax(0, 1fr)",
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  chrome: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    paddingInline: "22px",
    borderBottom: "1px solid #34362f",
    color: "#f4f1e8",
    backgroundColor: "#0a0a0a",
  },
  wordmark: {
    paddingLeft: {
      default: "64px",
      "@media (max-width: 820px)": "52px",
    },
    fontSize: "17px",
    letterSpacing: "-0.01em",
  },
  sidebar: {
    minHeight: 0,
    padding: "34px 20px 24px",
    borderRight: "1px solid #34362f",
    color: "#d9d9cf",
    backgroundColor: "#0a0a0a",
  },
  sectionLabel: {
    margin: "0 12px 18px",
    color: "#85887e",
    fontSize: "8px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  navigation: {
    display: "grid",
    gap: "4px",
  },
  navItem: {
    minHeight: "42px",
    paddingInline: "12px",
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    alignItems: "center",
    borderRadius: "2px",
    color: "#b7b9af",
    backgroundColor: "transparent",
    fontSize: "13px",
    textDecoration: "none",
    transition: "color 160ms ease, background-color 160ms ease",
    ":hover": {
      color: "#f7f4eb",
      backgroundColor: "#262823",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "2px",
    },
  },
  navNumber: {
    fontSize: "8px",
    opacity: 0.62,
  },
  main: {
    minWidth: 0,
    minHeight: 0,
    overflowY: "auto",
    backgroundColor: "#0a0a0a",
  },
  route: {
    minHeight: "100%",
  },
});
