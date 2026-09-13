import * as stylex from "@stylexjs/stylex";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotionConfig } from "motion/react";
import { useState } from "react";

import { colors } from "../styles/tokens.stylex.js";
import {
  HomeIcon,
  CollectionIcon,
  DecksIcon,
  SetsIcon,
  ListsIcon,
  SearchIcon,
} from "./navigation-icons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

const navigation = [
  { to: "/", label: "Home", icon: HomeIcon },
  { to: "/collection", label: "Collection", icon: CollectionIcon },
  { to: "/decks", label: "Decks", icon: DecksIcon },
  { to: "/sets", label: "Sets", icon: SetsIcon },
  { to: "/lists", label: "Lists", icon: ListsIcon },
  { to: "/search", label: "Search", icon: SearchIcon },
] as const;

export function BottomNavigation() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const reduceMotion = useReducedMotionConfig() ?? false;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverVisible, setHoverVisible] = useState(false);
  const [indicatorEntering, setIndicatorEntering] = useState(false);
  const activeIndex = navigation.findIndex((item) =>
    item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
  );
  const indicatorIndex = hoveredIndex;

  return (
    <TooltipProvider delay={450} closeDelay={0} timeout={350}>
      <span {...stylex.props(styles.navBackdrop)} aria-hidden="true" />
      <nav {...stylex.props(styles.navigation)} aria-label="Primary" data-window-no-drag>
        <div {...stylex.props(styles.navGroup)} onPointerLeave={() => setHoverVisible(false)}>
          {navigation.map((item, index) => (
            <div
              {...stylex.props(styles.navItemFrame)}
              key={item.to}
              onPointerEnter={() => {
                setIndicatorEntering(hoveredIndex === null);
                setHoveredIndex(index);
                setHoverVisible(true);
              }}
            >
              {indicatorIndex === index ? (
                <motion.span
                  {...stylex.props(styles.navHoverIndicator)}
                  layoutId="primary-navigation-hover"
                  initial={indicatorEntering ? { opacity: 0 } : false}
                  animate={{
                    opacity: hoverVisible && hoveredIndex !== activeIndex ? 1 : 0,
                  }}
                  onAnimationComplete={() => {
                    if (!hoverVisible) {
                      setHoveredIndex(null);
                      setIndicatorEntering(false);
                    }
                  }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          type: "spring",
                          duration: 0.16,
                          bounce: 0,
                          opacity: { duration: 0.08 },
                        }
                  }
                  aria-hidden="true"
                />
              ) : null}
              <Tooltip>
                <TooltipTrigger
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
                  <item.icon size={20} />
                </TooltipTrigger>
                <TooltipContent sideOffset={10}>{item.label}</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}

const styles = stylex.create({
  navigation: {
    maxWidth: "calc(100vw - 32px)",
    position: "fixed",
    zIndex: 10,
    left: "50%",
    bottom: "22px",
    padding: "7px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#474a42",
    borderRadius: "15px",
    backgroundColor: "rgba(20, 21, 18, 0.92)",
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.3)",
    backdropFilter: "blur(18px)",
    transform: "translateX(-50%)",
  },
  navBackdrop: {
    width: "100%",
    height: "132px",
    position: "fixed",
    zIndex: 9,
    left: 0,
    bottom: 0,
    backgroundImage:
      "linear-gradient(to bottom, transparent 0%, rgba(5, 6, 5, 0.32) 30%, rgba(5, 6, 5, 0.75) 68%, rgba(5, 6, 5, 0.98) 100%)",
    backdropFilter: "blur(5px) saturate(0.9)",
    maskImage:
      "linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.12) 24%, rgba(0, 0, 0, 0.55) 60%, black 86%)",
    pointerEvents: "none",
  },
  navGroup: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  navItemFrame: {
    width: {
      default: "44px",
      "@media (max-width: 420px)": "40px",
    },
    height: {
      default: "44px",
      "@media (max-width: 420px)": "40px",
    },
    position: "relative",
  },
  navHoverIndicator: {
    position: "absolute",
    zIndex: 0,
    inset: 0,
    borderRadius: "9px",
    backgroundColor: "#30332d",
    pointerEvents: "none",
  },
  navItem: {
    width: "100%",
    height: "100%",
    position: "relative",
    zIndex: 1,
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
});
