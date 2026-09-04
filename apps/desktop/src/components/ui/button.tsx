import { Button as ButtonPrimitive } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors, uiRadii } from "./theme.stylex";

export type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
export type ButtonSize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg";

export type ButtonProps = Omit<ButtonPrimitive.Props, "className" | "style"> & {
  size?: ButtonSize;
  style?: StyleXStyles;
  variant?: ButtonVariant;
};

export function Button({ size = "default", style, variant = "default", ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      {...stylex.props(
        styles.root,
        variant === "default" && styles.default,
        variant === "outline" && styles.outline,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        variant === "destructive" && styles.destructive,
        variant === "link" && styles.link,
        size === "default" && styles.sizeDefault,
        size === "xs" && styles.sizeXs,
        size === "sm" && styles.sizeSm,
        size === "lg" && styles.sizeLg,
        size === "icon" && styles.sizeIcon,
        size === "icon-xs" && styles.sizeIconXs,
        size === "icon-sm" && styles.sizeIconSm,
        size === "icon-lg" && styles.sizeIconLg,
        style,
      )}
      data-slot="button"
      {...props}
    />
  );
}

const styles = stylex.create({
  root: {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.375rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: uiRadii.lg,
    backgroundClip: "padding-box",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    whiteSpace: "nowrap",
    outline: "none",
    userSelect: "none",
    transitionProperty: "all",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    ":focus-visible": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    ":active:not([aria-haspopup])": {
      transform: "translateY(1px)",
    },
    ":disabled": {
      opacity: 0.5,
      pointerEvents: "none",
    },
    "[aria-invalid=true]": {
      borderColor: uiColors.destructive50,
      boxShadow: `0 0 0 3px ${uiColors.destructive40}`,
    },
  },
  default: {
    color: uiColors.primaryForeground,
    backgroundColor: uiColors.primary,
    ":hover": { backgroundColor: uiColors.primary80 },
  },
  outline: {
    color: uiColors.foreground,
    borderColor: uiColors.input,
    backgroundColor: uiColors.input30,
    ":hover": { backgroundColor: uiColors.input50 },
    "[aria-expanded=true]": {
      color: uiColors.foreground,
      backgroundColor: uiColors.muted,
    },
  },
  secondary: {
    color: uiColors.secondaryForeground,
    backgroundColor: uiColors.secondary,
    ":hover": { backgroundColor: uiColors.secondaryHover },
    "[aria-expanded=true]": {
      color: uiColors.secondaryForeground,
      backgroundColor: uiColors.secondary,
    },
  },
  ghost: {
    color: uiColors.foreground,
    backgroundColor: "transparent",
    ":hover": { backgroundColor: uiColors.muted50 },
    "[aria-expanded=true]": {
      color: uiColors.foreground,
      backgroundColor: uiColors.muted,
    },
  },
  destructive: {
    color: uiColors.destructive,
    backgroundColor: uiColors.destructive20,
    ":hover": { backgroundColor: uiColors.destructive30 },
    ":focus-visible": {
      borderColor: uiColors.destructive40,
      boxShadow: `0 0 0 3px ${uiColors.destructive40}`,
    },
  },
  link: {
    color: uiColors.primary,
    backgroundColor: "transparent",
    textUnderlineOffset: "4px",
    ":hover": { textDecorationLine: "underline" },
  },
  sizeDefault: {
    height: "2rem",
    paddingInline: "0.625rem",
  },
  sizeXs: {
    height: "1.5rem",
    paddingInline: "0.5rem",
    gap: "0.25rem",
    borderRadius: uiRadii.md,
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  sizeSm: {
    height: "1.75rem",
    paddingInline: "0.625rem",
    gap: "0.25rem",
    borderRadius: uiRadii.md,
    fontSize: "0.8rem",
  },
  sizeLg: {
    height: "2.25rem",
    paddingInline: "0.625rem",
  },
  sizeIcon: {
    width: "2rem",
    height: "2rem",
    padding: 0,
  },
  sizeIconXs: {
    width: "1.5rem",
    height: "1.5rem",
    padding: 0,
    gap: 0,
    borderRadius: uiRadii.md,
  },
  sizeIconSm: {
    width: "1.75rem",
    height: "1.75rem",
    padding: 0,
    gap: 0,
    borderRadius: uiRadii.md,
  },
  sizeIconLg: {
    width: "2.25rem",
    height: "2.25rem",
    padding: 0,
    gap: 0,
  },
});
