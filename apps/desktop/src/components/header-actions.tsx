import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { useAuth } from "../features/auth/use-auth";
import { canAccessProfile } from "../features/profile/profile-access";
import { useWorkspaceRuntime } from "../features/workspace/workspace-runtime-context";
import { colors } from "../styles/tokens.stylex.js";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function HeaderActions() {
  return (
    <div {...stylex.props(styles.actions)}>
      <SettingsButton />
      <ProfileButton />
    </div>
  );
}

function SettingsButton() {
  return (
    <TooltipProvider delay={450} closeDelay={0} timeout={350}>
      <Tooltip>
        <TooltipTrigger
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
        </TooltipTrigger>
        <TooltipContent align="end" side="bottom" sideOffset={9}>
          Settings
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ProfileButton() {
  const { snapshot } = useAuth();
  const { runtime } = useWorkspaceRuntime();
  const user = snapshot.user;
  if (!user || !canAccessProfile(snapshot, runtime)) return null;
  const label = `Profile for ${user.name}`;

  return (
    <TooltipProvider delay={450} closeDelay={0} timeout={350}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              {...stylex.props(styles.button, styles.buttonSignedIn)}
              aria-label={label}
              data-window-no-drag
              to="/profile"
            />
          }
        >
          <span {...stylex.props(styles.initials)} aria-hidden="true">
            {initials(user.name)}
          </span>
        </TooltipTrigger>
        <TooltipContent align="end" side="bottom" sideOffset={9}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "M";
}

const styles = stylex.create({
  actions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  button: {
    width: "24px",
    height: "24px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: "7px",
    color: "#b7b9af",
    textDecoration: "none",
    transition: {
      default:
        "border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1)",
      "@media (prefers-reduced-motion: reduce)":
        "border-color 140ms ease, background-color 140ms ease, color 140ms ease",
    },
    ":hover": {
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
});
