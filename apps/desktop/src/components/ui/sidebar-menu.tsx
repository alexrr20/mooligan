// StyleX port of Fluid Functionalism's composable sidebar menus.
import { Button } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from "react";

import { useFluidHover } from "../../hooks/use-fluid-hover";
import { FluidHoverHighlight } from "../fluid-hover-highlight";
import { fontSizes } from "../../styles/tokens.stylex.js";
import { uiColors, uiRadii } from "./theme.stylex";

const menuButtonSelector = '[data-sidebar="menu-button"], [data-sidebar="menu-sub-button"]';
function rowDisabled(element: HTMLElement) {
  return (
    element.matches(':disabled, [aria-disabled="true"]') || Boolean(element.closest("[hidden]"))
  );
}

export function SidebarMenu({
  className,
  children,
  ref,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onKeyDown,
  ...props
}: ComponentProps<"ul">) {
  const containerRef = useRef<HTMLUListElement>(null);
  const hover = useFluidHover(containerRef, { isItemDisabled: rowDisabled });
  const { registerItem } = hover;
  const [rows, setRows] = useState<HTMLElement[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const previousRow = useRef<HTMLElement | null>(null);
  const hoveredRow = hover.activeIndex === null ? null : (rows[hover.activeIndex] ?? null);
  const rowChanged = previousRow.current !== hoveredRow;
  useLayoutEffect(() => {
    previousRow.current = hoveredRow;
  });

  // Register the actual controls, including composed Links and sub-menu rows.
  // Watch DOM changes because these parts are independently composable.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let registered: HTMLElement[] = [];
    const syncRows = () => {
      const next = [...container.querySelectorAll<HTMLElement>(menuButtonSelector)].filter(
        (element) =>
          element.closest('[data-sidebar="menu"]') === container && !element.closest("[hidden]"),
      );
      if (
        next.length !== registered.length ||
        next.some((element, index) => element !== registered[index])
      ) {
        for (let index = next.length; index < registered.length; index++) registerItem(index, null);
        next.forEach((element, index) => registerItem(index, element));
        registered = next;
        setRows(next);
      }
      setSelectedIndex(
        next.findIndex((element) => element.getAttribute("aria-current") === "page"),
      );
    };
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-external-store-subscription -- Measures committed DOM controls, not an application store.
    syncRows();
    const observer = new MutationObserver(syncRows);
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "disabled", "aria-disabled", "aria-current"],
    });
    return () => {
      observer.disconnect();
      registered.forEach((_, index) => registerItem(index, null));
    };
  }, [registerItem]);

  return (
    <ul
      {...props}
      data-sidebar="menu"
      ref={(node) => {
        containerRef.current = node;
        if (ref instanceof Function) return ref(node);
        if (ref) ref.current = node;
      }}
      className={[stylex.props(styles.menu).className, className].filter(Boolean).join(" ")}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!event.defaultPrevented && event.pointerType === "mouse") hover.handlers.onMouseEnter();
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!event.defaultPrevented && event.pointerType === "mouse")
          hover.handlers.onMouseMove(event);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        hover.handlers.onMouseLeave();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) hover.handlers.onClick(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        hover.handlers.onMouseLeave();
      }}
    >
      {children}
      <FluidHoverHighlight
        hover={hover}
        from={hover.itemRects[selectedIndex]}
        transition={rowChanged ? undefined : false}
      />
    </ul>
  );
}
export function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      {...props}
      data-sidebar="menu-item"
      className={[stylex.props(styles.item).className, className].filter(Boolean).join(" ")}
    />
  );
}

export interface SidebarMenuButtonProps extends Omit<Button.Props, "className"> {
  className?: string;
  isActive?: boolean;
  icon?: ComponentType<{ size?: number; className?: string }>;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
}
export function SidebarMenuButton({
  className,
  isActive = false,
  icon: Icon,
  size = "default",
  variant = "default",
  children,
  ...props
}: SidebarMenuButtonProps) {
  return (
    <Button
      {...props}
      data-sidebar="menu-button"
      data-active={isActive || undefined}
      aria-current={isActive ? "page" : undefined}
      className={[
        stylex.props(
          styles.button,
          size === "sm" && styles.small,
          size === "lg" && styles.large,
          variant === "outline" && styles.outline,
          isActive && styles.active,
          isActive && styles.selected,
        ).className,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {Icon && (
        <span {...stylex.props(styles.icon, size === "sm" && styles.smallIcon)} aria-hidden="true">
          <Icon size={size === "sm" ? 14 : 18} />
        </span>
      )}
      <span {...stylex.props(styles.text)}>{children}</span>
    </Button>
  );
}

export function SidebarMenuAction({
  className,
  style,
  showOnHover = false,
  ...props
}: Omit<Button.Props, "className" | "style"> & {
  className?: string;
  style?: StyleXStyles;
  showOnHover?: boolean;
}) {
  return (
    <Button
      {...props}
      data-sidebar="menu-action"
      className={[
        stylex.props(styles.action, showOnHover && styles.hoverAction, style).className,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function SidebarMenuBadge({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-sidebar="menu-badge"
      className={[stylex.props(styles.badge).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarMenuSub({
  className,
  open = true,
  ...props
}: ComponentProps<"ul"> & { open?: boolean }) {
  return (
    <ul
      {...props}
      hidden={!open}
      data-sidebar="menu-sub"
      className={[
        stylex.props(styles.menu, styles.sub, !open && styles.hidden).className,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
export function SidebarMenuSubItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      {...props}
      data-sidebar="menu-sub-item"
      className={[stylex.props(styles.item).className, className].filter(Boolean).join(" ")}
    />
  );
}
export function SidebarMenuSubButton({
  className,
  isActive = false,
  render,
  ref,
  children,
  ...props
}: useRender.ComponentProps<"a"> & { isActive?: boolean }) {
  return useRender({
    defaultTagName: "a",
    render,
    ref,
    props: {
      ...props,
      children: <span {...stylex.props(styles.text, styles.subText)}>{children}</span>,
      "data-sidebar": "menu-sub-button",
      "aria-current": isActive ? "page" : undefined,
      className: [
        stylex.props(
          styles.button,
          styles.small,
          isActive && styles.active,
          isActive && styles.selected,
        ).className,
        className,
      ]
        .filter(Boolean)
        .join(" "),
    },
  });
}
export function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: ComponentProps<"div"> & { showIcon?: boolean }) {
  return (
    <div
      {...props}
      data-sidebar="menu-skeleton"
      aria-hidden="true"
      className={[stylex.props(styles.skeleton).className, className].filter(Boolean).join(" ")}
    >
      {showIcon && <span {...stylex.props(styles.skeletonIcon)} />}
      <span {...stylex.props(styles.skeletonText)} />
    </div>
  );
}

const styles = stylex.create({
  menu: {
    position: "relative",
    isolation: "isolate",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    width: "100%",
    minWidth: 0,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  item: { position: "relative", minWidth: 0 },
  button: {
    position: "relative",
    display: "flex",
    width: "100%",
    height: "36px",
    minWidth: 0,
    alignItems: "center",
    gap: "8px",
    padding: "0 8px",
    borderWidth: 0,
    borderRadius: uiRadii.md,
    backgroundColor: "transparent",
    color: uiColors.mutedForeground,
    textAlign: "left",
    textDecoration: "none",
    fontSize: fontSizes.base,
    fontWeight: 400,
    cursor: "pointer",
    outline: "none",
    "[data-fluid-hover-active]": { color: uiColors.foreground },
    ":focus-visible": { outline: "2px solid #6b97ff", outlineOffset: "-2px" },
    ":disabled": { opacity: 0.5, cursor: "default" },
    ':is([data-sidebar="menu-item"]:has(> [data-sidebar="menu-action"], > [data-sidebar="menu-badge"]) > *)':
      { paddingRight: "36px" },
  },
  active: { color: uiColors.foreground, fontWeight: 500 },
  small: { height: "28px", fontSize: fontSizes.sm },
  smallIcon: { width: "14px", height: "14px" },
  large: { height: "44px" },
  outline: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.border,
    backgroundColor: uiColors.background,
  },
  selected: { backgroundColor: uiColors.accent },
  icon: {
    position: "relative",
    zIndex: 1,
    display: "inline-flex",
    flexShrink: 0,
    width: "18px",
    height: "18px",
  },
  text: {
    position: "relative",
    zIndex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subText: { flex: 1 },
  action: {
    position: "absolute",
    right: "6px",
    top: "6px",
    zIndex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    padding: "2px",
    borderWidth: 0,
    borderRadius: uiRadii.sm,
    backgroundColor: "transparent",
    color: uiColors.mutedForeground,
    cursor: "pointer",
    ":hover": { backgroundColor: uiColors.muted, color: uiColors.foreground },
    ":focus-visible": { outline: "2px solid #6b97ff" },
  },
  hoverAction: {
    opacity: { default: 1, "@media (hover: hover) and (pointer: fine)": 0 },
    ':is([data-sidebar="menu-item"]:hover > *, [data-sidebar="menu-item"]:focus-within > *)': {
      opacity: 1,
    },
  },
  badge: {
    position: "absolute",
    right: "8px",
    top: "8px",
    minWidth: "20px",
    height: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 4px",
    pointerEvents: "none",
    color: uiColors.mutedForeground,
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
  },
  sub: {
    width: "auto",
    margin: "4px 0 4px 16px",
    paddingLeft: "12px",
    borderLeftWidth: "1px",
    borderLeftStyle: "solid",
    borderLeftColor: uiColors.border,
  },
  hidden: { display: "none" },
  skeleton: { height: "36px", display: "flex", alignItems: "center", gap: "8px", padding: "0 8px" },
  skeletonIcon: {
    width: "18px",
    height: "18px",
    borderRadius: uiRadii.sm,
    backgroundColor: uiColors.muted50,
  },
  skeletonText: {
    width: "65%",
    height: "14px",
    borderRadius: uiRadii.sm,
    backgroundColor: uiColors.muted50,
  },
});
