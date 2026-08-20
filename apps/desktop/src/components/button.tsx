import { Button as BaseButton } from "@base-ui/react/button";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../styles/tokens.stylex.js";
import { typography } from "../styles/typography";

export type ButtonProps = Omit<BaseButton.Props, "className" | "style"> & {
  fullWidth?: boolean;
  size?: "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "ghost";
};

/**
 * Mooligan's shared action button. Base UI supplies the interaction and
 * accessibility behavior while StyleX keeps the visual variants consistent.
 */
export function Button({
  fullWidth = false,
  size = "medium",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      {...stylex.props(
        typography.control,
        styles.root,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        size === "small" && styles.small,
        size === "large" && styles.large,
        fullWidth && styles.fullWidth,
      )}
    />
  );
}

const styles = stylex.create({
  root: {
    "-electron-corner-smoothing": "60%",
    paddingInline: "10px",
    paddingBlock: "13.5px 10.5px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    appearance: "none",
    borderWidth: "0",
    borderStyle: "none",
    borderColor: "transparent",
    borderRadius: "12px",
    whiteSpace: "nowrap",
    cursor: "pointer",
    transition: "opacity 140ms ease",
    ":disabled": {
      cursor: "not-allowed",
      opacity: 0.42,
    },
  },
  primary: {
    color: "#064E3B",
    backgroundColor: colors.accent,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#10BC60",
    boxShadow: "0 0 5px rgba(16, 188, 96, 0.2)",
    textShadow: "0 0 4px rgba(6, 78, 59, 0.2)",
  },
  secondary: {
    color: "#f4f1e8",
    backgroundColor: "transparent",
    ":hover:not(:disabled)": {
      borderColor: "#85887e",
      backgroundColor: "rgba(244, 241, 232, 0.05)",
    },
  },
  ghost: {
    color: "#a6a89d",
    backgroundColor: "transparent",
    ":hover:not(:disabled)": {
      color: "#f4f1e8",
      backgroundColor: "rgba(244, 241, 232, 0.05)",
    },
  },
  small: {
    minHeight: "34px",
    paddingInline: "11px",
    gap: "10px",
  },
  large: {
    minHeight: "44px",
    paddingInline: "16px",
    gap: "22px",
  },
  fullWidth: {
    width: "100%",
  },
});
