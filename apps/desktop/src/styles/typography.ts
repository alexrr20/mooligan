import * as stylex from "@stylexjs/stylex";

import {
  fontFamilies,
  fontSizes,
  fontWeights,
  letterSpacings,
  lineHeights,
} from "./tokens.stylex.js";

/**
 * Semantic text roles. Components supply color, spacing, truncation, and alignment.
 */
export const typography = stylex.create({
  display: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes["3xl"],
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.tighter,
    lineHeight: lineHeights.display,
  },
  pageTitle: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes["2xl"],
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.tight,
    lineHeight: lineHeights.tight,
  },
  heading: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.tight,
    lineHeight: lineHeights.tight,
  },
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.normal,
    lineHeight: lineHeights.relaxed,
  },
  bodyLarge: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.normal,
    lineHeight: lineHeights.normal,
  },
  bodySmall: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.regular,
    letterSpacing: letterSpacings.normal,
    lineHeight: lineHeights.normal,
  },
  control: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacings.wide,
    lineHeight: lineHeights.snug,
    textTransform: "uppercase",
  },
  label: {
    fontFamily: fontFamilies.sans,
    fontSize: fontSizes["2xs"],
    fontWeight: fontWeights.semibold,
    letterSpacing: letterSpacings.wider,
    lineHeight: lineHeights.snug,
    textTransform: "uppercase",
  },
});
