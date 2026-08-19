import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  accent: "#11C565",
});

export const fontFamilies = stylex.defineVars({
  sans: '"Config Rounded", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

export const fontSizes = stylex.defineVars({
  "2xs": "0.5rem",
  xs: "0.625rem",
  sm: "0.75rem",
  base: "0.875rem",
  lg: "1.125rem",
  xl: "1.5rem",
  "2xl": "1.875rem",
  "3xl": "3rem",
});

export const fontWeights = stylex.defineVars({
  regular: "400",
  medium: "500",
  semibold: "600",
});

export const lineHeights = stylex.defineVars({
  display: "0.94",
  tight: "1.1",
  snug: "1.25",
  normal: "1.5",
  relaxed: "1.65",
});

export const letterSpacings = stylex.defineVars({
  tighter: "-0.045em",
  tight: "-0.02em",
  normal: "0",
  wide: "0.04em",
  wider: "0.1em",
});
