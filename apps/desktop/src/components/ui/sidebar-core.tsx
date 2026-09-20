// StyleX port of Fluid Functionalism's Base UI sidebar.
// https://www.fluidfunctionalism.com/r/base/sidebar.json
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { Separator } from "@base-ui/react/separator";
import * as stylex from "@stylexjs/stylex";
import { SidebarLeft01Icon, SidebarRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useReducedMotionConfig } from "motion/react";

import { useMediaQuery } from "../../hooks/use-media-query";
import {
  isSidebarShortcut,
  sidebarCookie,
  sidebarResize,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_MOBILE,
} from "../../lib/sidebar-state";
import { fontSizes } from "../../styles/tokens.stylex.js";
import { uiColors, uiRadii } from "./theme.stylex";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export * from "../../lib/sidebar-state";
export type SidebarSide = "left" | "right";
export type SidebarVariant = "sidebar" | "floating" | "inset";
export type SidebarCollapsible = "offcanvas" | "none";

export interface SidebarContextValue {
  open: boolean;
  state: "expanded" | "collapsed";
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  width: string;
  setWidth: (width: string) => void;
  widthMobile: string;
  side: SidebarSide;
  registerSide: (side: SidebarSide) => void;
  shortcut: string | null;
  peek: "none" | "hover" | "click";
  isPeeking: boolean;
  setIsPeeking: (peeking: boolean) => void;
  schedulePeek: () => void;
  scheduleDismissPeek: () => void;
  cancelPeekTimer: () => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
  reducedMotion: boolean;
  mobileBreakpoint: number;
}
const SidebarContext = createContext<SidebarContextValue | null>(null);
const mountedProviders = new Set<HTMLDivElement>();

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
}

export interface SidebarProviderProps extends ComponentProps<"div"> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  persist?: boolean;
  shortcut?: string | null;
  mobileBreakpoint?: number;
  peek?: "none" | "hover" | "click";
  width?: string;
  widthMobile?: string;
}

export function SidebarProvider({
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  persist = true,
  shortcut: customShortcut,
  mobileBreakpoint = 768,
  peek = "none",
  width: initialWidth = SIDEBAR_WIDTH,
  widthMobile = SIDEBAR_WIDTH_MOBILE,
  className,
  style,
  children,
  ref,
  ...props
}: SidebarProviderProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const [openMobile, setOpenMobile] = useState(false);
  const [side, registerSide] = useState<SidebarSide>("left");
  const [width, setWidth] = useState(initialWidth);
  const [previousWidth, setPreviousWidth] = useState(initialWidth);
  if (previousWidth !== initialWidth) {
    setPreviousWidth(initialWidth);
    setWidth(initialWidth);
  }
  const [isResizing, setIsResizing] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const isMobile = useMediaQuery(`(width < ${mobileBreakpoint}px)`);
  const reducedMotion = useReducedMotionConfig() ?? false;
  const isPeeking = !open && peek !== "none" && !isMobile && peeking;
  const shortcut = customShortcut === undefined ? (side === "left" ? "[" : "]") : customShortcut;
  const wrapper = useRef<HTMLDivElement>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPeekTimer = useCallback(() => {
    if (peekTimer.current !== null) clearTimeout(peekTimer.current);
    peekTimer.current = null;
  }, []);
  const setIsPeeking = useCallback(
    (next: boolean) => {
      cancelPeekTimer();
      setPeeking(next);
    },
    [cancelPeekTimer],
  );
  const schedulePeek = useCallback(() => {
    cancelPeekTimer();
    peekTimer.current = setTimeout(() => setIsPeeking(true), 150);
  }, [cancelPeekTimer, setIsPeeking]);
  const scheduleDismissPeek = useCallback(() => {
    cancelPeekTimer();
    peekTimer.current = setTimeout(() => setIsPeeking(false), 250);
  }, [cancelPeekTimer, setIsPeeking]);
  useEffect(() => cancelPeekTimer, [cancelPeekTimer]);
  const setOpen = useCallback(
    (next: boolean) => {
      cancelPeekTimer();
      setPeeking(false);
      setInternalOpen(next);
      onOpenChange?.(next);
      if (persist) document.cookie = sidebarCookie(next);
    },
    [cancelPeekTimer, onOpenChange, persist],
  );
  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile(!openMobile);
    else setOpen(!open);
  }, [isMobile, openMobile, open, setOpen]);
  const keyboardToggle = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      Boolean(
        target.isContentEditable ||
        target.closest(
          'input, textarea, select, [role="textbox"], [role="menu"], [role="listbox"], [role="dialog"]:not([data-sidebar="sidebar"])',
        ),
      );
    if (!isSidebarShortcut(event, shortcut, typing)) return;
    const root = wrapper.current;
    if (!root || !(target instanceof Node)) return;
    const containing = [...mountedProviders].filter((element) => element.contains(target));
    const owner =
      containing.find(
        (element) => !containing.some((other) => other !== element && element.contains(other)),
      ) ??
      [...mountedProviders].find(
        (element) =>
          ![...mountedProviders].some((other) => other !== element && other.contains(element)),
      );
    if (owner !== root) return;
    event.preventDefault();
    toggleSidebar();
  });
  useEffect(() => {
    const root = wrapper.current;
    if (!root) return;
    mountedProviders.add(root);
    const onKeyDown = (event: KeyboardEvent) => keyboardToggle(event);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      mountedProviders.delete(root);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <SidebarContext.Provider
      value={{
        open,
        state: open ? "expanded" : "collapsed",
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
        width,
        setWidth,
        widthMobile,
        side,
        registerSide,
        shortcut,
        peek,
        isPeeking,
        setIsPeeking,
        schedulePeek,
        scheduleDismissPeek,
        cancelPeekTimer,
        isResizing,
        setIsResizing,
        reducedMotion,
        mobileBreakpoint,
      }}
    >
      <div
        {...props}
        {...stylex.props(styles.provider)}
        className={[stylex.props(styles.provider).className, className].filter(Boolean).join(" ")}
        style={style}
        data-slot="sidebar-wrapper"
        ref={(node) => {
          wrapper.current = node;
          // React 19 composes the caller's ref without changing the public DOM ref.
          if (ref instanceof Function) return ref(node);
          if (ref) ref.current = node;
        }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export type SidebarTriggerProps = Omit<ButtonPrimitive.Props, "className"> & { className?: string };
export function SidebarTrigger({
  className,
  onClick,
  onPointerEnter,
  onPointerLeave,
  children,
  ...props
}: SidebarTriggerProps) {
  const {
    toggleSidebar,
    open,
    openMobile,
    isMobile,
    side,
    shortcut,
    peek,
    isPeeking,
    schedulePeek,
    cancelPeekTimer,
  } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ButtonPrimitive
            {...props}
            {...stylex.props(styles.trigger)}
            className={[stylex.props(styles.trigger).className, className]
              .filter(Boolean)
              .join(" ")}
            data-sidebar="trigger"
            aria-label="Toggle sidebar"
            aria-expanded={expanded}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) toggleSidebar();
            }}
            onPointerEnter={(event) => {
              onPointerEnter?.(event);
              if (!open && !isMobile && peek === "hover" && event.pointerType === "mouse")
                schedulePeek();
            }}
            onPointerLeave={(event) => {
              onPointerLeave?.(event);
              if (!isPeeking) cancelPeekTimer();
            }}
          />
        }
      >
        {children ?? (
          <HugeiconsIcon
            icon={side === "left" ? SidebarLeft01Icon : SidebarRight01Icon}
            size={18}
            aria-hidden="true"
          />
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {expanded ? "Collapse sidebar" : "Expand sidebar"}
        {shortcut && <kbd {...stylex.props(styles.key)}>{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export type SidebarRailProps = Omit<ButtonPrimitive.Props, "className"> & {
  className?: string;
  tooltipOpen?: boolean;
};
export function SidebarRail({ className, tooltipOpen, ...props }: SidebarRailProps) {
  const { side, open, setOpen, setWidth, toggleSidebar, setIsResizing, isResizing, shortcut } =
    useSidebar();
  const drag = useRef<{ x: number; width: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  function finishDrag() {
    drag.current = null;
    setIsResizing(false);
  }
  return (
    <Tooltip open={isResizing ? false : tooltipOpen}>
      <TooltipTrigger
        render={
          <ButtonPrimitive
            {...props}
            {...stylex.props(styles.rail, side === "left" ? styles.railLeft : styles.railRight)}
            className={[
              stylex.props(styles.rail, side === "left" ? styles.railLeft : styles.railRight)
                .className,
              className,
            ]
              .filter(Boolean)
              .join(" ")}
            data-sidebar="rail"
            aria-label="Resize sidebar"
            title="Drag to resize, click to collapse"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const panel = event.currentTarget.closest('[data-sidebar="panel"]');
              if (!panel) return;
              suppressClick.current = false;
              drag.current = {
                x: event.clientX,
                width: panel.getBoundingClientRect().width,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const delta = (event.clientX - drag.current.x) * (side === "left" ? 1 : -1);
              if (!drag.current.moved && Math.abs(delta) < 4) return;
              drag.current.moved = true;
              suppressClick.current = true;
              setIsResizing(true);
              const next = sidebarResize(drag.current.width, delta);
              setWidth(`${next.width}px`);
              if (next.open !== open) setOpen(next.open);
            }}
            onPointerUp={(event) => {
              finishDrag();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={finishDrag}
            onLostPointerCapture={finishDrag}
            onClick={() => {
              if (!suppressClick.current) toggleSidebar();
              suppressClick.current = false;
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const panel = event.currentTarget.closest('[data-sidebar="panel"]');
              if (!panel) return;
              const delta = (event.key === "ArrowRight" ? 16 : -16) * (side === "left" ? 1 : -1);
              setWidth(
                `${event.key === "Home" ? 160 : event.key === "End" ? 360 : sidebarResize(panel.getBoundingClientRect().width, delta).width}px`,
              );
            }}
          />
        }
      />
      <TooltipContent side={side === "left" ? "right" : "left"}>
        Drag to resize. Click to collapse.{shortcut && <kbd>{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      {...props}
      data-slot="sidebar-inset"
      className={[stylex.props(styles.inset).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="header"
      className={[stylex.props(styles.section).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="footer"
      className={[stylex.props(styles.section, styles.footer).className, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function SidebarSeparator({ className, ...props }: Separator.Props) {
  return (
    <Separator
      {...props}
      data-sidebar="separator"
      className={[stylex.props(styles.separator).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="group"
      className={[stylex.props(styles.group).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="group-label"
      className={[stylex.props(styles.label).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarGroupContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="group-content"
      className={[stylex.props(styles.groupContent).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarInput({
  className,
  ...props
}: Omit<InputPrimitive.Props, "className"> & { className?: string }) {
  return (
    <InputPrimitive
      {...props}
      data-sidebar="input"
      className={[stylex.props(styles.input).className, className].filter(Boolean).join(" ")}
    />
  );
}

const styles = stylex.create({
  provider: {
    position: "relative",
    display: "flex",
    width: "100%",
    minHeight: 0,
    height: "100%",
    isolation: "isolate",
  },
  inset: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 0,
    ':is([data-slot="sidebar-wrapper"]:has(> [data-variant="inset"]) > *)': {
      margin: "8px",
      borderRadius: uiRadii.xl,
    },
  },
  trigger: {
    width: "36px",
    height: "36px",
    display: "inline-flex",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderWidth: 0,
    borderRadius: uiRadii.md,
    backgroundColor: "transparent",
    color: uiColors.mutedForeground,
    cursor: "pointer",
    ":hover": { backgroundColor: uiColors.muted50, color: uiColors.foreground },
    ":focus-visible": { outline: "2px solid #6b97ff", outlineOffset: "2px" },
  },
  key: {
    marginLeft: "4px",
    padding: "0 4px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "currentColor",
    borderRadius: "3px",
    fontSize: "10px",
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "8px",
    padding: 0,
    borderWidth: 0,
    zIndex: 5,
    backgroundColor: "transparent",
    cursor: "col-resize",
    touchAction: "none",
    ":hover": { backgroundColor: uiColors.foreground10 },
    ":focus-visible": { outline: "2px solid #6b97ff", outlineOffset: "-2px" },
  },
  railLeft: { right: 0 },
  railRight: { left: 0 },
  section: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "8px",
    padding: "8px",
    minWidth: 0,
  },
  footer: { marginTop: "auto" },
  separator: {
    margin: "0 8px",
    height: "1px",
    flexShrink: 0,
    borderWidth: 0,
    backgroundColor: uiColors.border,
  },
  group: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    padding: "8px",
  },
  label: {
    display: "flex",
    alignItems: "center",
    height: "28px",
    padding: "0 8px",
    flexShrink: 0,
    fontSize: fontSizes.xs,
    fontWeight: 500,
    color: uiColors.mutedForeground,
  },
  groupContent: { minWidth: 0, width: "100%", fontSize: "14px" },
  input: {
    height: "32px",
    width: "100%",
    minWidth: 0,
    padding: "0 12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.border,
    borderRadius: uiRadii.md,
    backgroundColor: "transparent",
    color: uiColors.foreground,
    fontSize: "14px",
    ":focus-visible": { outline: "2px solid #6b97ff" },
    "::placeholder": { color: uiColors.mutedForeground },
  },
});
