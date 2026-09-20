import * as stylex from "@stylexjs/stylex";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig } from "motion/react";

import { AppSidebar } from "../components/app-sidebar";
import { SidebarProvider, SidebarInset } from "../components/ui/sidebar";
import { CatalogSetup } from "../components/catalog-setup";
import { useSidebarPreference } from "../features/preferences/use-sidebar-preference";
import { useMotionPreference } from "../features/preferences/use-motion-preference";
import { usePriceUpdates } from "../features/prices/price-updates";
import { pageInsets } from "../styles/tokens.stylex";

export const Route = createRootRoute({
  component: AppShell,
});

const reducedMotionByPreference = {
  full: "never",
  reduced: "always",
  system: "user",
} as const;

function AppShell() {
  usePriceUpdates();
  const sidebar = useSidebarPreference();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { motion: motionPreference } = useMotionPreference();
  const reducedMotion = reducedMotionByPreference[motionPreference];

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div {...stylex.props(styles.app)}>
        <header {...stylex.props(styles.chrome)} data-window-drag-region />

        <SidebarProvider
          open={sidebar.open}
          onOpenChange={sidebar.setOpen}
          width="15rem"
          persist={false}
        >
          <AppSidebar />
          <SidebarInset>
            <div
              {...stylex.props(styles.main, !sidebar.open && styles.mainCollapsed)}
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
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
      <CatalogSetup />
    </MotionConfig>
  );
}

const styles = stylex.create({
  app: {
    position: "relative",
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr)",
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  chrome: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "88px",
    height: "50px",
    zIndex: 1,
  },
  main: {
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 0,
    borderRadius: "inherit",
    paddingBlock: 0,
    paddingTop: { default: 0, "@media (width < 768px)": "50px" },
    paddingInline: pageInsets.shellInline,
    overflowY: "auto",
  },
  mainCollapsed: { paddingTop: "50px" },
  route: {
    minHeight: "100%",
    borderRadius: "10px",
  },
});
