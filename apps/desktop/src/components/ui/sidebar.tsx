// StyleX port of Fluid Functionalism's Base UI sidebar.
// https://www.fluidfunctionalism.com/r/base/sidebar.json
import { Button } from "@base-ui/react/button";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, type ComponentProps } from "react";

import {
  SidebarRail,
  SidebarTrigger,
  useSidebar,
  type SidebarSide,
  type SidebarVariant,
  type SidebarCollapsible,
} from "./sidebar-core";
import { uiColors, uiRadii } from "./theme.stylex";

export * from "./sidebar-core";
export * from "./sidebar-menu";

export interface SidebarProps extends ComponentProps<"div"> {
  side?: SidebarSide;
  variant?: SidebarVariant;
  collapsible?: SidebarCollapsible;
  bordered?: boolean;
  rail?: boolean;
  railTooltipOpen?: boolean;
}

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  bordered = true,
  rail = true,
  railTooltipOpen,
  className,
  style,
  children,
  ...props
}: SidebarProps) {
  const {
    open,
    isMobile,
    openMobile,
    setOpenMobile,
    width,
    widthMobile,
    registerSide,
    peek,
    isPeeking,
    setIsPeeking,
    schedulePeek,
    scheduleDismissPeek,
    cancelPeekTimer,
    reducedMotion,
    isResizing,
  } = useSidebar();
  const shell = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  // The provider owns the global shortcut; register the edge of its rendered rail.
  useEffect(() => registerSide(side), [side, registerSide]);
  const staticColumn = collapsible === "none";
  const expanded = staticColumn || open;
  const peeking = !staticColumn && isPeeking;
  const visible = expanded || peeking;
  const peekEnabled = !staticColumn && peek !== "none" && !open && !isResizing;
  useEffect(() => {
    if (!peeking) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsPeeking(false);
      shell.current?.querySelector<HTMLElement>('[data-sidebar="peek-trigger"]')?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !shell.current?.contains(event.target))
        setIsPeeking(false);
    }
    function onPointerMove(event: PointerEvent) {
      if (peek !== "hover") return;
      const bounds = shell.current
        ?.querySelector('[data-sidebar="panel"]')
        ?.getBoundingClientRect();
      if (!bounds) return;
      if (
        event.clientX >= bounds.left - 8 &&
        event.clientX <= bounds.right + 8 &&
        event.clientY >= bounds.top - 8 &&
        event.clientY <= bounds.bottom + 8
      )
        cancelPeekTimer();
      else scheduleDismissPeek();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, [peeking, peek, setIsPeeking, cancelPeekTimer, scheduleDismissPeek]);

  if (isMobile && !staticColumn) {
    return (
      <Dialog.Root open={openMobile} onOpenChange={(next) => setOpenMobile(next)}>
        <Dialog.Portal>
          <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
          <Dialog.Popup
            {...props}
            ref={popup}
            initialFocus={popup}
            aria-label="Workspace navigation"
            data-sidebar="sidebar"
            data-slot="sidebar"
            data-mobile="true"
            data-side={side}
            {...stylex.props(
              styles.drawer,
              side === "left" ? styles.left : styles.right,
              side === "left" ? styles.drawerLeft : styles.drawerRight,
              reducedMotion && styles.reducedDrawer,
            )}
            className={[
              stylex.props(
                styles.drawer,
                side === "left" ? styles.left : styles.right,
                side === "left" ? styles.drawerLeft : styles.drawerRight,
                reducedMotion && styles.reducedDrawer,
              ).className,
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ width: widthMobile, ...style }}
          >
            <div {...stylex.props(styles.drawerClose)}>
              <SidebarTrigger />
            </div>
            {children}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <div
      ref={shell}
      data-slot="sidebar"
      data-state={expanded ? "expanded" : "collapsed"}
      data-variant={variant}
      data-side={side}
      data-collapsible={staticColumn ? "none" : "offcanvas"}
      {...stylex.props(
        styles.shell,
        (reducedMotion || isResizing) && styles.instant,
        side === "right" && styles.last,
        (peekEnabled || peeking) && styles.raised,
      )}
      style={{ width: expanded ? width : 0 }}
    >
      {peekEnabled && (
        <Button
          {...stylex.props(styles.peekStrip, side === "left" ? styles.left : styles.right)}
          data-sidebar="peek-trigger"
          aria-label="Peek sidebar"
          aria-expanded={peeking}
          onPointerEnter={(event) => {
            if (peek === "hover" && event.pointerType === "mouse") schedulePeek();
          }}
          onPointerLeave={() => {
            if (!peeking) cancelPeekTimer();
          }}
          onClick={() => setIsPeeking(!peeking)}
        />
      )}
      <div
        {...props}
        data-sidebar="panel"
        data-peeking={peeking || undefined}
        inert={!visible}
        {...stylex.props(
          styles.panel,
          side === "left" ? styles.left : styles.right,
          !visible && (side === "left" ? styles.offLeft : styles.offRight),
          variant === "floating" && styles.floatingGutter,
          variant === "inset" && styles.insetGutter,
          peeking && styles.peekGutter,
          reducedMotion && styles.reducedPanel,
          reducedMotion && !visible && styles.transparent,
          isResizing && styles.instant,
        )}
        className={[
          stylex.props(
            styles.panel,
            side === "left" ? styles.left : styles.right,
            !visible && (side === "left" ? styles.offLeft : styles.offRight),
            variant === "floating" && styles.floatingGutter,
            variant === "inset" && styles.insetGutter,
            peeking && styles.peekGutter,
            reducedMotion && styles.reducedPanel,
            reducedMotion && !visible && styles.transparent,
            isResizing && styles.instant,
          ).className,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ width, ...style }}
      >
        <div
          data-sidebar="sidebar"
          {...stylex.props(
            styles.inner,
            (variant === "floating" || peeking) && styles.card,
            variant === "sidebar" &&
              bordered &&
              !peeking &&
              (side === "left" ? styles.borderRight : styles.borderLeft),
          )}
        >
          {children}
        </div>
        {rail && !staticColumn && !peeking && <SidebarRail tooltipOpen={railTooltipOpen} />}
      </div>
    </div>
  );
}

export function SidebarContent({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="content"
      {...stylex.props(styles.content)}
      className={[stylex.props(styles.content).className, className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}

const styles = stylex.create({
  shell: {
    position: "relative",
    flexShrink: 0,
    height: "100%",
    minHeight: 0,
    overflow: "clip",
    transitionProperty: "width",
    transitionDuration: "240ms",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
  },
  last: { order: 1 },
  raised: { zIndex: 40, overflow: "visible" },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    transform: "translateX(0)",
    transitionProperty: "transform, opacity",
    transitionDuration: "240ms",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
    color: uiColors.foreground,
  },
  left: { left: 0 },
  right: { right: 0 },
  offLeft: { transform: "translateX(-100%)", pointerEvents: "none" },
  offRight: { transform: "translateX(100%)", pointerEvents: "none" },
  floatingGutter: { padding: "8px" },
  insetGutter: { paddingBlock: "8px" },
  peekGutter: { padding: "8px", zIndex: 50 },
  inner: { display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, width: "100%" },
  card: {
    borderRadius: uiRadii.xl,
    backgroundColor: uiColors.card,
    boxShadow: `0 0 0 1px ${uiColors.border}, 0 12px 40px #0005`,
    overflow: "hidden",
  },
  borderRight: {
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: uiColors.border,
  },
  borderLeft: {
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: uiColors.border,
  },
  peekStrip: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "12px",
    zIndex: 1,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    ":hover": { backgroundColor: uiColors.foreground10 },
    ":focus-visible": { outline: "2px solid #6b97ff", outlineOffset: "-2px" },
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    backgroundColor: "#000a",
    transitionProperty: "opacity",
    transitionDuration: "160ms",
    "[data-starting-style]": { opacity: 0 },
    "[data-ending-style]": { opacity: 0 },
  },
  drawer: {
    position: "fixed",
    top: 0,
    bottom: 0,
    zIndex: 50,
    maxWidth: "calc(100vw - 32px)",
    display: "flex",
    flexDirection: "column",
    outline: "none",
    backgroundColor: uiColors.card,
    color: uiColors.foreground,
    boxShadow: "0 0 40px #0006",
    transitionProperty: "transform, opacity",
    transitionDuration: "200ms",
    transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
  },
  drawerLeft: {
    "[data-starting-style]": { transform: "translateX(-100%)" },
    "[data-ending-style]": { transform: "translateX(-100%)" },
  },
  drawerRight: {
    "[data-starting-style]": { transform: "translateX(100%)" },
    "[data-ending-style]": { transform: "translateX(100%)" },
  },
  reducedDrawer: {
    "[data-starting-style]": { transform: "none", opacity: 0 },
    "[data-ending-style]": { transform: "none", opacity: 0 },
  },
  reducedPanel: { transform: "none", transitionProperty: "opacity", transitionDuration: "120ms" },
  transparent: { opacity: 0 },
  instant: { transitionDuration: "0ms" },
  drawerClose: { display: "flex", justifyContent: "flex-end", padding: "8px 8px 0" },
  content: {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 0",
    minHeight: 0,
    minWidth: 0,
    width: "100%",
    overflow: "clip",
  },
});
