import * as stylex from "@stylexjs/stylex";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { motion, MotionConfig } from "motion/react";

import { AppSidebar } from "../components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { CatalogSetup } from "../components/catalog-setup";
import { GlobalSearch } from "../components/global-search";
import { HeaderActions } from "../components/header-actions";
import { useSidebarPreference } from "../features/preferences/use-sidebar-preference";
import { useMotionPreference } from "../features/preferences/use-motion-preference";
import { usePriceUpdates } from "../features/prices/price-updates";

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
        <header {...stylex.props(styles.chrome)} data-window-drag-region>
          <GlobalSearch />
          <HeaderActions />
        </header>

        <SidebarProvider
          open={sidebar.open}
          onOpenChange={sidebar.setOpen}
          width="15rem"
          persist={false}
        >
          <AppSidebar />
          <SidebarInset>
            <div {...stylex.props(styles.sidebarToolbar)}>
              <SidebarTrigger />
            </div>
            <div
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
    height: "100vh",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "50px minmax(0, 1fr)",
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  chrome: {
    gridColumn: "1 / -1",
    position: "relative",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    paddingLeft: "22px",
    paddingRight: "12px",
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
  sidebarToolbar: {
    display: "flex",
    alignItems: "center",
    minHeight: "40px",
    paddingInline: "8px",
  },
  main: {
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 0,
    padding: "0 12px",
    overflowY: "auto",
    backgroundColor: "#0d0d0d",
  },
  route: {
    minHeight: "100%",
    borderRadius: "10px",
    backgroundColor: "#0d0d0d",
  },
});
