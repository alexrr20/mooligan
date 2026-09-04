import * as stylex from "@stylexjs/stylex";

// shadcn's neutral theme, using its dark values because the desktop shell is dark-only.
export const uiColors = stylex.defineVars({
  accent: "oklch(0.269 0 0)",
  accentForeground: "oklch(0.985 0 0)",
  background: "oklch(0.145 0 0)",
  border: "oklch(1 0 0 / 10%)",
  card: "oklch(0.205 0 0)",
  cardForeground: "oklch(0.985 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
  destructive20: "oklch(0.704 0.191 22.216 / 20%)",
  destructive30: "oklch(0.704 0.191 22.216 / 30%)",
  destructive40: "oklch(0.704 0.191 22.216 / 40%)",
  destructive50: "oklch(0.704 0.191 22.216 / 50%)",
  foreground: "oklch(0.985 0 0)",
  foreground10: "oklch(0.985 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
  input30: "oklch(1 0 0 / 4.5%)",
  input50: "oklch(1 0 0 / 7.5%)",
  input80: "oklch(1 0 0 / 12%)",
  muted: "oklch(0.269 0 0)",
  muted50: "oklch(0.269 0 0 / 50%)",
  mutedForeground: "oklch(0.708 0 0)",
  popover: "oklch(0.205 0 0)",
  popover70: "oklch(0.205 0 0 / 70%)",
  popoverForeground: "oklch(0.985 0 0)",
  primary: "oklch(0.922 0 0)",
  primary80: "oklch(0.922 0 0 / 80%)",
  primaryForeground: "oklch(0.205 0 0)",
  ring: "oklch(0.556 0 0)",
  ring50: "oklch(0.556 0 0 / 50%)",
  secondary: "oklch(0.269 0 0)",
  secondaryForeground: "oklch(0.985 0 0)",
  secondaryHover: "color-mix(in oklch, oklch(0.269 0 0), oklch(0.985 0 0) 5%)",
});

export const uiRadii = stylex.defineVars({
  lg: "0.625rem",
  md: "0.5rem",
  sm: "0.375rem",
  xl: "0.875rem",
});
