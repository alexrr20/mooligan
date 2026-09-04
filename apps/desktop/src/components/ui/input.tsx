import { Input as InputPrimitive } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors, uiRadii } from "./theme.stylex";

export type InputProps = Omit<InputPrimitive.Props, "className" | "style"> & {
  style?: StyleXStyles;
};

export function Input({ style, ...props }: InputProps) {
  return <InputPrimitive {...stylex.props(styles.root, style)} data-slot="input" {...props} />;
}

const styles = stylex.create({
  root: {
    width: "100%",
    minWidth: 0,
    height: "2rem",
    paddingInline: "0.625rem",
    paddingBlock: "0.25rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.input,
    borderRadius: uiRadii.lg,
    color: uiColors.foreground,
    backgroundColor: uiColors.input30,
    fontSize: {
      default: "1rem",
      "@media (min-width: 768px)": "0.875rem",
    },
    lineHeight: {
      default: "1.5rem",
      "@media (min-width: 768px)": "1.25rem",
    },
    outline: "none",
    transitionProperty:
      "color, background-color, border-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    "::placeholder": { color: uiColors.mutedForeground },
    ":focus-visible": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    ":disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
      pointerEvents: "none",
      backgroundColor: uiColors.input80,
    },
    "[aria-invalid=true]": {
      borderColor: uiColors.destructive50,
      boxShadow: `0 0 0 3px ${uiColors.destructive40}`,
    },
  },
});
