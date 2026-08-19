import * as stylex from "@stylexjs/stylex";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig } from "motion/react";

import { BottomNavigation } from "../components/bottom-navigation";
import { CatalogSetup } from "../components/catalog-setup";
import { usePreferences } from "../features/preferences/use-preferences";

export const Route = createRootRoute({
  component: AppShell,
});

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

        <BottomNavigation />

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
  main: {
    minWidth: 0,
    minHeight: 0,
    padding: "0 12px 12px",
    overflowY: "auto",
    backgroundColor: "#0a0a0a",
  },
  route: {
    minHeight: "100%",
    borderRadius: "10px",
    backgroundColor: "#121213",
  },
});
