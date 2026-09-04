import { Select as SelectPrimitive } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { uiColors, uiRadii } from "./theme.stylex";

type StyleProps = { style?: StyleXStyles };

export const Select = SelectPrimitive.Root;

export function SelectGroup({
  style,
  ...props
}: Omit<SelectPrimitive.Group.Props, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.Group
      {...stylex.props(styles.group, style)}
      data-slot="select-group"
      {...props}
    />
  );
}

export function SelectValue({
  style,
  ...props
}: Omit<SelectPrimitive.Value.Props, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.Value
      {...stylex.props(styles.value, style)}
      data-slot="select-value"
      {...props}
    />
  );
}

type SelectTriggerProps = Omit<SelectPrimitive.Trigger.Props, "className" | "style"> &
  StyleProps & { size?: "default" | "sm" };

export function SelectTrigger({ children, size = "default", style, ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      {...stylex.props(styles.trigger, size === "sm" && styles.triggerSmall, style)}
      data-size={size}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon {...stylex.props(styles.triggerIcon)}>
        <ChevronDownIcon />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

type SelectContentProps = Omit<SelectPrimitive.Popup.Props, "className" | "style"> &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignItemWithTrigger" | "alignOffset" | "side" | "sideOffset"
  > &
  StyleProps;

export function SelectContent({
  align = "center",
  alignItemWithTrigger = true,
  alignOffset = 0,
  children,
  side = "bottom",
  sideOffset = 4,
  style,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        {...stylex.props(styles.positioner)}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          {...stylex.props(styles.content, style)}
          data-align-trigger={alignItemWithTrigger}
          data-slot="select-content"
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectLabel({
  style,
  ...props
}: Omit<SelectPrimitive.GroupLabel.Props, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.GroupLabel
      {...stylex.props(styles.label, style)}
      data-slot="select-label"
      {...props}
    />
  );
}

export function SelectItem({
  children,
  style,
  ...props
}: Omit<SelectPrimitive.Item.Props, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.Item {...stylex.props(styles.item, style)} data-slot="select-item" {...props}>
      <SelectPrimitive.ItemText {...stylex.props(styles.itemText)}>
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator {...stylex.props(styles.itemIndicator)} render={<span />}>
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({
  style,
  ...props
}: Omit<SelectPrimitive.Separator.Props, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.Separator
      {...stylex.props(styles.separator, style)}
      data-slot="select-separator"
      {...props}
    />
  );
}

export function SelectScrollUpButton({
  style,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.ScrollUpArrow>, "className" | "style"> & StyleProps) {
  return (
    <SelectPrimitive.ScrollUpArrow
      {...stylex.props(styles.scrollButton, styles.scrollUp, style)}
      data-slot="select-scroll-up-button"
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

export function SelectScrollDownButton({
  style,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.ScrollDownArrow>, "className" | "style"> &
  StyleProps) {
  return (
    <SelectPrimitive.ScrollDownArrow
      {...stylex.props(styles.scrollButton, styles.scrollDown, style)}
      data-slot="select-scroll-down-button"
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

function ChevronDownIcon() {
  return (
    <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg {...stylex.props(styles.icon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

const styles = stylex.create({
  group: {
    marginBlock: "0.25rem",
    padding: "0.25rem",
  },
  value: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    overflow: "hidden",
    textAlign: "left",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    "[data-placeholder]": { color: uiColors.mutedForeground },
  },
  trigger: {
    width: "fit-content",
    height: "2rem",
    paddingBlock: "0.5rem",
    paddingRight: "0.5rem",
    paddingLeft: "0.625rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.375rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.input,
    borderRadius: uiRadii.lg,
    color: uiColors.foreground,
    backgroundColor: uiColors.input30,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    whiteSpace: "nowrap",
    outline: "none",
    userSelect: "none",
    transitionProperty:
      "color, background-color, border-color, text-decoration-color, fill, stroke",
    transitionDuration: "150ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    ":hover": { backgroundColor: uiColors.input50 },
    ":focus-visible": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
    ":disabled": {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    "[data-placeholder]": { color: uiColors.mutedForeground },
    "[aria-invalid=true]": {
      borderColor: uiColors.destructive50,
      boxShadow: `0 0 0 3px ${uiColors.destructive40}`,
    },
  },
  triggerSmall: {
    height: "1.75rem",
    borderRadius: uiRadii.md,
  },
  triggerIcon: {
    width: "1rem",
    height: "1rem",
    flexShrink: 0,
    display: "inline-flex",
    color: uiColors.mutedForeground,
    pointerEvents: "none",
  },
  positioner: {
    zIndex: 50,
    isolation: "isolate",
  },
  content: {
    width: "var(--anchor-width)",
    minWidth: "9rem",
    maxHeight: "var(--available-height)",
    position: "relative",
    zIndex: 50,
    isolation: "isolate",
    overflowX: "hidden",
    overflowY: "auto",
    borderRadius: uiRadii.lg,
    color: uiColors.popoverForeground,
    backgroundColor: uiColors.popover70,
    boxShadow: `0 4px 6px -1px rgb(0 0 0 / 10%), 0 2px 4px -2px rgb(0 0 0 / 10%), 0 0 0 1px ${uiColors.foreground10}`,
    transformOrigin: "var(--transform-origin)",
    transitionProperty: "opacity, transform",
    transitionDuration: "100ms",
    "::before": {
      content: "",
      position: "absolute",
      zIndex: -1,
      inset: 0,
      borderRadius: "inherit",
      backdropFilter: "blur(40px) saturate(150%)",
      pointerEvents: "none",
    },
    "[data-starting-style]": {
      opacity: 0,
      transform: "scale(0.95)",
    },
    "[data-ending-style]": {
      opacity: 0,
      transform: "scale(0.95)",
    },
    "[data-starting-style][data-side=bottom]": {
      transform: "translateY(-0.5rem) scale(0.95)",
    },
    "[data-starting-style][data-side=left]": {
      transform: "translateX(0.5rem) scale(0.95)",
    },
    "[data-starting-style][data-side=right]": {
      transform: "translateX(-0.5rem) scale(0.95)",
    },
    "[data-starting-style][data-side=top]": {
      transform: "translateY(0.5rem) scale(0.95)",
    },
    "[data-align-trigger=true]": { transitionDuration: "0ms" },
    "[data-align-trigger=true][data-starting-style]": {
      opacity: 1,
      transform: "none",
    },
    "[data-align-trigger=true][data-ending-style]": {
      opacity: 1,
      transform: "none",
    },
  },
  label: {
    paddingInline: "0.375rem",
    paddingBlock: "0.25rem",
    color: uiColors.mutedForeground,
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  item: {
    width: "100%",
    position: "relative",
    paddingTop: "0.25rem",
    paddingRight: "2rem",
    paddingBottom: "0.25rem",
    paddingLeft: "0.375rem",
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: uiRadii.sm,
    color: uiColors.popoverForeground,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    cursor: "default",
    outline: "none",
    userSelect: "none",
    ":focus": {
      color: uiColors.accentForeground,
      backgroundColor: uiColors.foreground10,
    },
    "[data-highlighted]": {
      color: uiColors.accentForeground,
      backgroundColor: uiColors.foreground10,
    },
    "[data-focused]": {
      color: uiColors.accentForeground,
      backgroundColor: uiColors.foreground10,
    },
    "[data-disabled]": {
      opacity: 0.5,
      pointerEvents: "none",
    },
  },
  itemText: {
    flex: 1,
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    whiteSpace: "nowrap",
  },
  itemIndicator: {
    width: "1rem",
    height: "1rem",
    position: "absolute",
    right: "0.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  separator: {
    height: "1px",
    marginInline: "-0.25rem",
    marginBlock: "0.25rem",
    backgroundColor: uiColors.border,
    pointerEvents: "none",
  },
  scrollButton: {
    width: "100%",
    zIndex: 10,
    paddingBlock: "0.25rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: uiColors.popover,
    cursor: "default",
  },
  scrollUp: { top: 0 },
  scrollDown: { bottom: 0 },
  icon: {
    width: "1rem",
    height: "1rem",
    flexShrink: 0,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    pointerEvents: "none",
  },
});
