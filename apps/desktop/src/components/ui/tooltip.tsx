import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { uiColors, uiRadii } from "./theme.stylex";

type StyleProps = { style?: StyleXStyles };

export function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

export function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

export function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

type TooltipContentProps = Omit<TooltipPrimitive.Popup.Props, "className" | "style"> &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> &
  StyleProps;

export function TooltipContent({
  align = "center",
  alignOffset = 0,
  children,
  side = "top",
  sideOffset = 4,
  style,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        {...stylex.props(styles.positioner)}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          {...stylex.props(styles.content, style)}
          data-slot="tooltip-content"
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow {...stylex.props(styles.arrow)} data-slot="tooltip-arrow" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

const styles = stylex.create({
  positioner: {
    zIndex: 50,
    isolation: "isolate",
  },
  content: {
    width: "fit-content",
    maxWidth: "20rem",
    zIndex: 50,
    paddingInline: "0.75rem",
    paddingBlock: "0.375rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    borderRadius: uiRadii.md,
    color: uiColors.background,
    backgroundColor: uiColors.foreground,
    fontSize: "0.75rem",
    lineHeight: "1rem",
    transformOrigin: "var(--transform-origin)",
    transitionProperty: "opacity, transform",
    transitionDuration: "150ms",
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
    "[data-instant]": { transitionDuration: "0ms" },
  },
  arrow: {
    width: "0.625rem",
    height: "0.625rem",
    zIndex: 50,
    borderRadius: "2px",
    backgroundColor: uiColors.foreground,
    fill: uiColors.foreground,
    transform: "translateY(calc(-50% - 2px)) rotate(45deg)",
    "[data-side=bottom]": { top: "0.25rem" },
    "[data-side=left]": {
      top: "50%",
      right: "-0.25rem",
      transform: "translateY(-50%) rotate(45deg)",
    },
    "[data-side=right]": {
      top: "50%",
      left: "-0.25rem",
      transform: "translateY(-50%) rotate(45deg)",
    },
    "[data-side=top]": { bottom: "-0.625rem" },
  },
});
