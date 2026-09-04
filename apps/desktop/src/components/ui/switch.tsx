import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors } from "./theme.stylex";

export type SwitchProps = Omit<SwitchPrimitive.Root.Props, "className" | "style"> & {
  size?: "default" | "sm";
  style?: StyleXStyles;
};

export function Switch({ size = "default", style, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      {...stylex.props(styles.root, size === "sm" && styles.rootSmall, style)}
      data-size={size}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        {...stylex.props(styles.thumb, size === "sm" && styles.thumbSmall)}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

const styles = stylex.create({
  root: {
    width: "32px",
    height: "18.4px",
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: "9999px",
    backgroundColor: uiColors.input80,
    outline: "none",
    transitionProperty: "all",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    "::after": {
      content: "",
      position: "absolute",
      insetInline: "-0.75rem",
      insetBlock: "-0.5rem",
    },
    ":focus-visible": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    "[data-checked]": { backgroundColor: uiColors.primary },
    "[data-disabled]": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    "[aria-invalid=true]": {
      borderColor: uiColors.destructive50,
      boxShadow: `0 0 0 3px ${uiColors.destructive40}`,
    },
  },
  rootSmall: {
    width: "24px",
    height: "14px",
  },
  thumb: {
    width: "16px",
    height: "16px",
    display: "block",
    borderRadius: "9999px",
    backgroundColor: uiColors.foreground,
    boxShadow: "0 0 #0000",
    pointerEvents: "none",
    transform: "translateX(0)",
    transitionProperty: "transform",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    "[data-checked]": {
      backgroundColor: uiColors.primaryForeground,
      transform: "translateX(calc(100% - 2px))",
    },
  },
  thumbSmall: {
    width: "12px",
    height: "12px",
  },
});
