import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors, uiRadii } from "./theme.stylex";

type StyleProps = { style?: StyleXStyles };

export function NumberField({
  style,
  ...props
}: Omit<NumberFieldPrimitive.Root.Props, "className" | "style"> & StyleProps) {
  return (
    <NumberFieldPrimitive.Root
      {...stylex.props(styles.root, style)}
      data-slot="number-field"
      {...props}
    />
  );
}

export function NumberFieldGroup({
  style,
  ...props
}: Omit<NumberFieldPrimitive.Group.Props, "className" | "style"> & StyleProps) {
  return (
    <NumberFieldPrimitive.Group
      {...stylex.props(styles.group, style)}
      data-slot="number-field-group"
      {...props}
    />
  );
}

export function NumberFieldInput({
  style,
  ...props
}: Omit<NumberFieldPrimitive.Input.Props, "className" | "style"> & StyleProps) {
  return (
    <NumberFieldPrimitive.Input
      {...stylex.props(styles.input, style)}
      data-slot="number-field-input"
      {...props}
    />
  );
}

export function NumberFieldIncrement({
  style,
  ...props
}: Omit<NumberFieldPrimitive.Increment.Props, "className" | "style"> & StyleProps) {
  return (
    <NumberFieldPrimitive.Increment
      {...stylex.props(styles.button, style)}
      data-slot="number-field-increment"
      {...props}
    />
  );
}

export function NumberFieldDecrement({
  style,
  ...props
}: Omit<NumberFieldPrimitive.Decrement.Props, "className" | "style"> & StyleProps) {
  return (
    <NumberFieldPrimitive.Decrement
      {...stylex.props(styles.button, style)}
      data-slot="number-field-decrement"
      {...props}
    />
  );
}

const styles = stylex.create({
  root: { width: "100%" },
  group: {
    width: "100%",
    height: "2rem",
    display: "grid",
    gridTemplateColumns: "2rem minmax(0, 1fr) 2rem",
    overflow: "hidden",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.input,
    borderRadius: uiRadii.lg,
    backgroundColor: uiColors.input30,
    transitionProperty:
      "color, background-color, border-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    ":focus-within": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    "[data-disabled]": {
      opacity: 0.5,
      backgroundColor: uiColors.input80,
    },
  },
  input: {
    width: "100%",
    minWidth: 0,
    height: "100%",
    paddingInline: "0.625rem",
    borderWidth: 0,
    color: uiColors.foreground,
    backgroundColor: "transparent",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    outline: "none",
  },
  button: {
    width: "2rem",
    height: "100%",
    padding: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    color: uiColors.foreground,
    backgroundColor: "transparent",
    fontSize: "0.875rem",
    fontWeight: 500,
    outline: "none",
    transitionProperty: "all",
    transitionDuration: "150ms",
    ":hover": { backgroundColor: uiColors.muted },
    ":focus-visible": { boxShadow: `inset 0 0 0 3px ${uiColors.ring50}` },
    ":disabled": {
      opacity: 0.5,
      pointerEvents: "none",
    },
  },
});
