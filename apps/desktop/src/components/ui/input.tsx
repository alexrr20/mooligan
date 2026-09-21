import { Input as InputPrimitive } from "@base-ui/react/input";
import * as stylex from "@stylexjs/stylex";

import { colors } from "../../styles/tokens.stylex.js";
import { uiColors } from "./theme.stylex";

export type InputProps = Omit<InputPrimitive.Props, "className" | "style">;

export function Input(props: InputProps) {
  const isSearch = props.type === "search";
  const input = (
    <InputPrimitive
      {...stylex.props(styles.root, isSearch && styles.withIcon)}
      data-slot="input"
      {...props}
    />
  );

  return isSearch ? (
    <div {...stylex.props(styles.iconContainer)}>
      {input}
      <span {...stylex.props(styles.leadingIcon)} aria-hidden="true">
        <svg {...stylex.props(styles.searchIcon)} fill="none" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      </span>
    </div>
  ) : (
    input
  );
}

const styles = stylex.create({
  iconContainer: {
    position: "relative",
    width: "100%",
    minWidth: 0,
  },
  leadingIcon: {
    position: "absolute",
    insetInlineStart: "10px",
    top: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    pointerEvents: "none",
  },
  searchIcon: {
    width: "16px",
    height: "16px",
    color: "#85887f",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  withIcon: { paddingInlineStart: "34px" },
  root: {
    width: "100%",
    minWidth: 0,
    height: "36px",
    paddingInline: "0.625rem",
    paddingBlock: "0.25rem",
    borderWidth: 0,
    borderRadius: "7px",
    color: uiColors.foreground,
    backgroundColor: "#1b1c1b",
    fontSize: "13px",
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
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "2px",
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
