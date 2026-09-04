import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors, uiRadii } from "./theme.stylex";

export type ToggleVariant = "default" | "outline";
export type ToggleSize = "default" | "sm" | "lg";

export type ToggleProps = Omit<TogglePrimitive.Props, "className" | "style"> & {
  size?: ToggleSize;
  style?: StyleXStyles;
  variant?: ToggleVariant;
};

export function Toggle({ size = "default", style, variant = "default", ...props }: ToggleProps) {
  return (
    <TogglePrimitive
      {...stylex.props(
        toggleStyles.root,
        variant === "default" && toggleStyles.default,
        variant === "outline" && toggleStyles.outline,
        size === "default" && toggleStyles.sizeDefault,
        size === "sm" && toggleStyles.sizeSmall,
        size === "lg" && toggleStyles.sizeLarge,
        style,
      )}
      data-size={size}
      data-slot="toggle"
      data-variant={variant}
      {...props}
    />
  );
}

export const toggleStyles = stylex.create({
  root: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.25rem",
    borderRadius: uiRadii.lg,
    color: uiColors.foreground,
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    whiteSpace: "nowrap",
    outline: "none",
    userSelect: "none",
    transitionProperty: "all",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    ":hover": {
      color: uiColors.foreground,
      backgroundColor: uiColors.muted,
    },
    ":focus-visible": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    ":disabled": {
      opacity: 0.5,
      pointerEvents: "none",
    },
    "[aria-pressed=true]": { backgroundColor: uiColors.muted },
    "[data-pressed]": { backgroundColor: uiColors.muted },
    "[data-state=on]": { backgroundColor: uiColors.muted },
  },
  default: { backgroundColor: "transparent" },
  outline: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.input,
    backgroundColor: "transparent",
    ":hover": { backgroundColor: uiColors.muted },
  },
  sizeDefault: {
    minWidth: "2rem",
    height: "2rem",
    paddingInline: "0.625rem",
  },
  sizeSmall: {
    minWidth: "1.75rem",
    height: "1.75rem",
    paddingInline: "0.625rem",
    borderRadius: uiRadii.md,
    fontSize: "0.8rem",
  },
  sizeLarge: {
    minWidth: "2.25rem",
    height: "2.25rem",
    paddingInline: "0.625rem",
  },
});
