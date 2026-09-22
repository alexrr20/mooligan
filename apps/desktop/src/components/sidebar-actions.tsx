import { Button } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { useAuth } from "../features/auth/use-auth";
import { canAccessProfile } from "../features/profile/profile-access";
import { useWorkspaceRuntime } from "../features/workspace/workspace-runtime-context";
import { colors } from "../styles/tokens.stylex.js";
import type { useCatalogSetup } from "./catalog-setup";
import { uiColors } from "./ui/theme.stylex";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export function SidebarActions({
  catalog,
  onNavigate,
}: {
  catalog: ReturnType<typeof useCatalogSetup>;
  onNavigate: () => void;
}) {
  return (
    <div {...stylex.props(styles.actions)}>
      <CatalogUpdateButton catalog={catalog} />
      <SettingsButton onNavigate={onNavigate} />
      <ProfileButton onNavigate={onNavigate} />
    </div>
  );
}

function CatalogUpdateButton({ catalog }: { catalog: ReturnType<typeof useCatalogSetup> }) {
  const { state, downloading, updating, progressPercent, progressLabel, download } = catalog;
  if (state.kind === "checking" || state.kind === "ready") return null;

  const label = downloading
    ? `${updating ? "Updating" : "Downloading"} card catalog: ${progressPercent === null ? progressLabel : `${progressPercent}%`}`
    : state.kind === "error"
      ? "Retry catalog download"
      : updating
        ? "Update card catalog"
        : "Download card catalog";

  return (
    <TooltipProvider delay={450} closeDelay={0} timeout={350}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              {...stylex.props(
                styles.button,
                styles.catalogButton,
                state.kind === "error" && styles.catalogError,
              )}
              aria-label={label}
              disabled={downloading}
              focusableWhenDisabled
              data-window-no-drag
              onClick={() => void download()}
            />
          }
        >
          {downloading ? (
            <span {...stylex.props(styles.progress)} aria-hidden="true">
              {progressPercent === null ? "…" : `${progressPercent}%`}
            </span>
          ) : (
            <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
            </svg>
          )}
        </TooltipTrigger>
        <TooltipContent align="end" side="top" sideOffset={9}>
          {state.kind === "error" ? `${state.message} Click to retry.` : label}
        </TooltipContent>
      </Tooltip>
      <span
        {...stylex.props(styles.visuallyHidden)}
        role={state.kind === "error" ? "alert" : "status"}
      >
        {state.kind === "error" ? `${state.message} ${label}.` : label}
      </span>
    </TooltipProvider>
  );
}

function SettingsButton({ onNavigate }: { onNavigate: () => void }) {
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
              onClick={onNavigate}
            />
          }
        >
          <SettingsIcon />
        </TooltipTrigger>
        <TooltipContent align="end" side="top" sideOffset={9}>
          Settings
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ProfileButton({ onNavigate }: { onNavigate: () => void }) {
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
              onClick={onNavigate}
            />
          }
        >
          <span {...stylex.props(styles.initials)} aria-hidden="true">
            {initials(user.name)}
          </span>
        </TooltipTrigger>
        <TooltipContent align="end" side="top" sideOffset={9}>
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
  catalogButton: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.accent,
    cursor: "pointer",
    "[data-disabled]": { cursor: "default" },
  },
  catalogError: { color: uiColors.destructive },
  progress: { fontSize: "9px", fontVariantNumeric: "tabular-nums", lineHeight: 1 },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
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
