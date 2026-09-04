import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { createContext, useContext, type ReactNode } from "react";

import { toggleStyles, type ToggleProps, type ToggleSize, type ToggleVariant } from "./toggle";
import { uiRadii } from "./theme.stylex";

type ToggleGroupSpacing = 0 | 1 | 2 | 4;
type ToggleGroupOrientation = "horizontal" | "vertical";
type ToggleGroupContextValue = {
  orientation: ToggleGroupOrientation;
  size: ToggleSize;
  spacing: ToggleGroupSpacing;
  variant: ToggleVariant;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue>({
  orientation: "horizontal",
  size: "default",
  spacing: 2,
  variant: "default",
});

export type ToggleGroupProps<Value extends string> = Omit<
  ToggleGroupPrimitive.Props<Value>,
  "children" | "className" | "style"
> & {
  children?: ReactNode;
  size?: ToggleSize;
  spacing?: ToggleGroupSpacing;
  style?: StyleXStyles;
  variant?: ToggleVariant;
};

export function ToggleGroup<Value extends string>({
  children,
  orientation = "horizontal",
  size = "default",
  spacing = 2,
  style,
  variant = "default",
  ...props
}: ToggleGroupProps<Value>) {
  return (
    <ToggleGroupPrimitive
      {...stylex.props(
        styles.group,
        orientation === "vertical" && styles.vertical,
        size === "sm" && styles.groupSmall,
        spacing === 0 && styles.gap0,
        spacing === 1 && styles.gap1,
        spacing === 2 && styles.gap2,
        spacing === 4 && styles.gap4,
        style,
      )}
      data-orientation={orientation}
      data-size={size}
      data-slot="toggle-group"
      data-spacing={spacing}
      data-variant={variant}
      orientation={orientation}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ orientation, size, spacing, variant }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

export function ToggleGroupItem({ size, style, variant, ...props }: ToggleProps) {
  const context = useContext(ToggleGroupContext);
  const resolvedVariant = variant ?? context.variant;

  return (
    <TogglePrimitive
      {...stylex.props(
        toggleStyles.root,
        resolvedVariant === "default" && toggleStyles.default,
        resolvedVariant === "outline" && toggleStyles.outline,
        (size ?? context.size) === "default" && toggleStyles.sizeDefault,
        (size ?? context.size) === "sm" && toggleStyles.sizeSmall,
        (size ?? context.size) === "lg" && toggleStyles.sizeLarge,
        styles.item,
        context.spacing === 0 && styles.joinedItem,
        context.spacing === 0 && context.orientation === "horizontal" && styles.joinedHorizontal,
        context.spacing === 0 && context.orientation === "vertical" && styles.joinedVertical,
        context.spacing === 0 &&
          resolvedVariant === "outline" &&
          context.orientation === "horizontal" &&
          styles.joinedOutlineHorizontal,
        context.spacing === 0 &&
          resolvedVariant === "outline" &&
          context.orientation === "vertical" &&
          styles.joinedOutlineVertical,
        style,
      )}
      data-slot="toggle-group-item"
      data-size={size ?? context.size}
      data-variant={resolvedVariant}
      {...props}
    />
  );
}

const styles = stylex.create({
  group: {
    width: "fit-content",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: uiRadii.lg,
  },
  groupSmall: { borderRadius: uiRadii.md },
  vertical: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  gap0: { gap: 0 },
  gap1: { gap: "0.25rem" },
  gap2: { gap: "0.5rem" },
  gap4: { gap: "1rem" },
  item: {
    flexShrink: 0,
    ":focus": { zIndex: 10 },
    ":focus-visible": { zIndex: 10 },
  },
  joinedItem: {
    paddingInline: "0.5rem",
    borderRadius: 0,
  },
  joinedHorizontal: {
    ":first-child": {
      borderTopLeftRadius: uiRadii.lg,
      borderBottomLeftRadius: uiRadii.lg,
    },
    ":last-child": {
      borderTopRightRadius: uiRadii.lg,
      borderBottomRightRadius: uiRadii.lg,
    },
  },
  joinedVertical: {
    ":first-child": {
      borderTopLeftRadius: uiRadii.lg,
      borderTopRightRadius: uiRadii.lg,
    },
    ":last-child": {
      borderBottomLeftRadius: uiRadii.lg,
      borderBottomRightRadius: uiRadii.lg,
    },
  },
  joinedOutlineHorizontal: {
    borderLeftWidth: 0,
    ":first-child": { borderLeftWidth: "1px" },
  },
  joinedOutlineVertical: {
    borderTopWidth: 0,
    ":first-child": { borderTopWidth: "1px" },
  },
});
