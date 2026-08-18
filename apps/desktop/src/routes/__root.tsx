import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig, useReducedMotionConfig } from "motion/react";

import { CatalogSetup } from "../components/catalog-setup";
import { usePreferences } from "../features/preferences/use-preferences";
import { colors } from "../styles/tokens.stylex.js";

export const Route = createRootRoute({
  component: AppShell,
});

const navigation = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/collection", label: "Collection", icon: "collection" },
  { to: "/decks", label: "Decks", icon: "decks" },
  { to: "/sets", label: "Sets", icon: "sets" },
  { to: "/lists", label: "Lists", icon: "lists" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/settings", label: "Settings", icon: "settings" },
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
        <header {...stylex.props(styles.chrome)} data-window-drag-region></header>

        <Navigation />

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

function Navigation() {
  const reduceMotion = useReducedMotionConfig() ?? false;

  return (
    <Tooltip.Provider delay={450} closeDelay={0} timeout={350}>
      <nav {...stylex.props(styles.navigation)} aria-label="Primary" data-window-no-drag>
        <div {...stylex.props(styles.navGroup)}>
          {navigation.map((item) => (
            <Tooltip.Root key={item.to}>
              <Tooltip.Trigger
                render={
                  <Link
                    {...stylex.props(styles.navItem, reduceMotion && styles.navItemReducedMotion)}
                    activeOptions={{ exact: item.to === "/" }}
                    activeProps={{
                      style: {
                        color: "#1b1d19",
                        backgroundColor: colors.accent,
                      },
                    }}
                    aria-label={item.label}
                    to={item.to}
                  />
                }
              >
                <NavigationIcon name={item.icon} />
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Positioner sideOffset={10}>
                  <Tooltip.Popup className="navigation-tooltip">{item.label}</Tooltip.Popup>
                </Tooltip.Positioner>
              </Tooltip.Portal>
            </Tooltip.Root>
          ))}
        </div>
      </nav>
    </Tooltip.Provider>
  );
}

type NavigationIconName = (typeof navigation)[number]["icon"];

function NavigationIcon({ name }: { name: NavigationIconName }) {
  return (
    <svg {...stylex.props(styles.navIcon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      {name === "home" ? (
        <>
          <path d="m3 10.75 9-7.5 9 7.5" />
          <path d="M5.5 9.25V21h13V9.25M9 21v-6.5h6V21" />
        </>
      ) : null}
      {name === "collection" ? (
        <>
          <path d="M6 5V3.5h12V5" />
          <rect width="18" height="16" x="3" y="5" rx="2" />
          <path d="M9 10h6" />
        </>
      ) : null}
      {name === "decks" ? (
        <>
          <path d="m12 3 9 4.75-9 4.75-9-4.75L12 3Z" />
          <path d="m3 12 9 4.75L21 12M3 16.25 12 21l9-4.75" />
        </>
      ) : null}
      {name === "sets" ? (
        <>
          <rect width="7" height="7" x="3" y="3" rx="1.5" />
          <rect width="7" height="7" x="14" y="3" rx="1.5" />
          <rect width="7" height="7" x="3" y="14" rx="1.5" />
          <rect width="7" height="7" x="14" y="14" rx="1.5" />
        </>
      ) : null}
      {name === "lists" ? (
        <>
          <path d="M9 6h12M9 12h12M9 18h12" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="2.5" />
        </>
      ) : null}
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <path d="M4 6h4M14 6h6M4 12h9M17 12h3M4 18h2M12 18h8" />
          <circle cx="11" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="18" r="2" />
        </>
      ) : null}
    </svg>
  );
}

const styles = stylex.create({
  app: {
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
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
  navigation: {
    maxWidth: "calc(100vw - 32px)",
    position: "fixed",
    zIndex: 10,
    left: "50%",
    bottom: "22px",
    padding: "7px",
    border: "1px solid #474a42",
    borderRadius: "15px",
    backgroundColor: "rgba(20, 21, 18, 0.92)",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.3)",
    backdropFilter: "blur(18px)",
    transform: "translateX(-50%)",
  },
  navGroup: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  navItem: {
    width: {
      default: "44px",
      "@media (max-width: 420px)": "40px",
    },
    height: {
      default: "44px",
      "@media (max-width: 420px)": "40px",
    },
    display: "grid",
    placeItems: "center",
    borderRadius: "9px",
    color: "#b7b9af",
    backgroundColor: "transparent",
    textDecoration: "none",
    transition:
      "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), color 160ms ease, background-color 160ms ease",
    ":hover": {
      color: "#f7f4eb",
      backgroundColor: "#30332d",
    },
    ":active": {
      transform: "scale(0.96)",
    },
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "2px",
    },
  },
  navItemReducedMotion: {
    transition: "color 160ms ease, background-color 160ms ease",
    ":active": {
      transform: "none",
    },
  },
  navIcon: {
    width: "20px",
    height: "20px",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  main: {
    minWidth: 0,
    minHeight: 0,
    paddingBottom: "108px",
    overflowY: "auto",
    backgroundColor: "#0a0a0a",
  },
  route: {
    minHeight: "100%",
  },
});
