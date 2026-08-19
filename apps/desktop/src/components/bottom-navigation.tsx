import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion, useReducedMotionConfig } from "motion/react";
import { useState } from "react";

import { colors } from "../styles/tokens.stylex.js";

const navigation = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/collection", label: "Collection", icon: "collection" },
  { to: "/decks", label: "Decks", icon: "decks" },
  { to: "/sets", label: "Sets", icon: "sets" },
  { to: "/lists", label: "Lists", icon: "lists" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/settings", label: "Settings", icon: "settings" },
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
    <Tooltip.Provider delay={450} closeDelay={0} timeout={350}>
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
              <Tooltip.Root>
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
                    <Tooltip.Popup {...stylex.props(styles.tooltip)}>{item.label}</Tooltip.Popup>
                  </Tooltip.Positioner>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
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
  navIcon: {
    width: "20px",
    height: "20px",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  tooltip: {
    zIndex: 20,
    padding: "7px 10px",
    border: "1px solid #4a4d45",
    borderRadius: "7px",
    color: "#f4f1e8",
    backgroundColor: "#20221e",
    boxShadow: "0 8px 24px rgb(0 0 0 / 38%)",
    fontSize: "10px",
    letterSpacing: "0.02em",
    pointerEvents: "none",
    transformOrigin: "var(--transform-origin)",
    transition: {
      default:
        "opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)",
      "@media (prefers-reduced-motion: reduce)": "opacity 140ms cubic-bezier(0.23, 1, 0.32, 1)",
    },
    "[data-starting-style]": {
      opacity: 0,
      transform: {
        default: "translateY(3px) scale(0.97)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    "[data-ending-style]": {
      opacity: 0,
      transform: {
        default: "translateY(3px) scale(0.97)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    "[data-instant]": {
      transitionDuration: "0ms",
    },
  },
});
