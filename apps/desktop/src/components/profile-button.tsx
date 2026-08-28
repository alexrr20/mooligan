import { Tooltip } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { useAuth } from "../features/auth/use-auth";
import { colors } from "../styles/tokens.stylex.js";

export function SettingsButton() {
  return (
    <Tooltip.Provider delay={450} closeDelay={0} timeout={350}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Link
              {...stylex.props(styles.button)}
              activeProps={{
                style: {
                  borderColor: colors.accent,
                },
              }}
              aria-label="Settings"
              data-window-no-drag
              to="/settings"
            />
          }
        >
          <SettingsIcon />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner align="end" side="bottom" sideOffset={9}>
            <Tooltip.Popup {...stylex.props(styles.tooltip)}>Settings</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function ProfileButton() {
  const { snapshot } = useAuth();
  const user = snapshot.user;
  const label = user ? `Profile settings for ${user.name}` : "Profile settings";

  return (
    <Tooltip.Provider delay={450} closeDelay={0} timeout={350}>
      <Tooltip.Root>
        <Tooltip.Trigger
          render={
            <Link
              {...stylex.props(styles.button, user && styles.buttonSignedIn)}
              aria-label={label}
              data-window-no-drag
              to="/settings"
            />
          }
        >
          {user ? (
            <span {...stylex.props(styles.initials)} aria-hidden="true">
              {initials(user.name)}
            </span>
          ) : (
            <ProfileIcon />
          )}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner align="end" side="bottom" sideOffset={9}>
            <Tooltip.Popup {...stylex.props(styles.tooltip)}>{label}</Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function SettingsIcon() {
  return (
    <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 6h4M14 6h6M4 12h9M17 12h3M4 18h2M12 18h8" />
      <circle cx="11" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="9" cy="18" r="2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.75 20c.45-3.45 2.53-5.25 6.25-5.25s5.8 1.8 6.25 5.25" />
    </svg>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "M";
}

const styles = stylex.create({
  button: {
    width: "24px",
    height: "24px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    overflow: "hidden",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#3c3e38",
    borderRadius: "7px",
    color: "#b7b9af",
    backgroundColor: "#151613",
    textDecoration: "none",
    boxShadow: "0 1px 0 rgba(255, 255, 255, 0.04) inset",
    transition: {
      default:
        "border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1)",
      "@media (prefers-reduced-motion: reduce)":
        "border-color 140ms ease, background-color 140ms ease, color 140ms ease",
    },
    ":hover": {
      borderColor: "#61645b",
      color: "#f7f4eb",
      backgroundColor: "#20221e",
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
  buttonSignedIn: {
    borderColor: colors.accent,
    color: "#102117",
    backgroundColor: colors.accent,
    ":hover": {
      borderColor: "#37db82",
      color: "#0a1710",
      backgroundColor: "#37db82",
    },
  },
  initials: {
    fontSize: "7px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    lineHeight: 1,
  },
  icon: {
    width: "14px",
    height: "14px",
    stroke: "currentColor",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  tooltip: {
    zIndex: 20,
    maxWidth: "220px",
    padding: "7px 10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#4a4d45",
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
        default: "translateY(-3px) scale(0.97)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    "[data-ending-style]": {
      opacity: 0,
      transform: {
        default: "translateY(-3px) scale(0.97)",
        "@media (prefers-reduced-motion: reduce)": "none",
      },
    },
    "[data-instant]": {
      transitionDuration: "0ms",
    },
  },
});
