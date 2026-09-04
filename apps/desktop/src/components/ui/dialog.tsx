import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { uiColors, uiRadii } from "./theme.stylex";

type StyleProps = { style?: StyleXStyles };

export function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose({
  style,
  ...props
}: Omit<DialogPrimitive.Close.Props, "className" | "style"> & StyleProps) {
  return <DialogPrimitive.Close {...stylex.props(style)} data-slot="dialog-close" {...props} />;
}

export function DialogOverlay({
  style,
  ...props
}: Omit<DialogPrimitive.Backdrop.Props, "className" | "style"> & StyleProps) {
  return (
    <DialogPrimitive.Backdrop
      {...stylex.props(styles.overlay, style)}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

type DialogContentProps = Omit<DialogPrimitive.Popup.Props, "className" | "style"> & {
  showCloseButton?: boolean;
  style?: StyleXStyles;
};

export function DialogContent({
  children,
  showCloseButton = true,
  style,
  ...props
}: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        {...stylex.props(styles.content, style)}
        data-slot="dialog-content"
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={<Button size="icon-sm" style={styles.closeButton} variant="ghost" />}
          >
            <CloseIcon />
            <span {...stylex.props(styles.visuallyHidden)}>Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export function DialogHeader({
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & StyleProps) {
  return <div {...stylex.props(styles.header, style)} data-slot="dialog-header" {...props} />;
}

export function DialogFooter({
  children,
  showCloseButton = false,
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> &
  StyleProps & { showCloseButton?: boolean }) {
  return (
    <div {...stylex.props(styles.footer, style)} data-slot="dialog-footer" {...props}>
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close render={<Button variant="outline" />}>Close</DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

export function DialogTitle({
  style,
  ...props
}: Omit<DialogPrimitive.Title.Props, "className" | "style"> & StyleProps) {
  return (
    <DialogPrimitive.Title
      {...stylex.props(styles.title, style)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export function DialogDescription({
  style,
  ...props
}: Omit<DialogPrimitive.Description.Props, "className" | "style"> & StyleProps) {
  return (
    <DialogPrimitive.Description
      {...stylex.props(styles.description, style)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

function CloseIcon() {
  return (
    <svg {...stylex.props(styles.closeIcon)} aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

const styles = stylex.create({
  overlay: {
    position: "fixed",
    zIndex: 50,
    inset: 0,
    isolation: "isolate",
    backgroundColor: "rgb(0 0 0 / 10%)",
    backdropFilter: "blur(4px)",
    transitionProperty: "opacity",
    transitionDuration: "100ms",
    "[data-starting-style]": { opacity: 0 },
    "[data-ending-style]": { opacity: 0 },
  },
  content: {
    width: "100%",
    maxWidth: {
      default: "calc(100% - 2rem)",
      "@media (min-width: 640px)": "24rem",
    },
    position: "fixed",
    zIndex: 50,
    top: "50%",
    left: "50%",
    padding: "1rem",
    display: "grid",
    gap: "1rem",
    borderRadius: uiRadii.xl,
    color: uiColors.popoverForeground,
    backgroundColor: uiColors.popover,
    boxShadow: `0 0 0 1px ${uiColors.foreground10}`,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    outline: "none",
    transform: "translate(-50%, -50%)",
    transitionProperty: "opacity, transform",
    transitionDuration: "100ms",
    "[data-starting-style]": {
      opacity: 0,
      transform: "translate(-50%, -50%) scale(0.95)",
    },
    "[data-ending-style]": {
      opacity: 0,
      transform: "translate(-50%, -50%) scale(0.95)",
    },
  },
  closeButton: {
    position: "absolute",
    top: "0.5rem",
    right: "0.5rem",
  },
  closeIcon: {
    width: "1rem",
    height: "1rem",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  footer: {
    marginInline: "-1rem",
    marginBottom: "-1rem",
    padding: "1rem",
    display: "flex",
    flexDirection: {
      default: "column-reverse",
      "@media (min-width: 640px)": "row",
    },
    justifyContent: {
      default: "normal",
      "@media (min-width: 640px)": "flex-end",
    },
    gap: "0.5rem",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: uiColors.border,
    borderBottomLeftRadius: uiRadii.xl,
    borderBottomRightRadius: uiRadii.xl,
    backgroundColor: uiColors.muted50,
  },
  title: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 500,
    lineHeight: 1,
  },
  description: {
    margin: 0,
    color: uiColors.mutedForeground,
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  visuallyHidden: {
    width: "1px",
    height: "1px",
    position: "absolute",
    margin: "-1px",
    padding: 0,
    overflow: "hidden",
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
  },
});
