export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = "16rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "[";
export const SIDEBAR_KEYBOARD_SHORTCUT_RIGHT = "]";
export const SIDEBAR_MIN_WIDTH = 160;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_COLLAPSE_SLOP = 56;

export function sidebarResize(startWidth: number, delta: number) {
  const width = startWidth + delta;
  return {
    open: width >= SIDEBAR_MIN_WIDTH - SIDEBAR_COLLAPSE_SLOP,
    width: Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width)),
  };
}

export function readSidebarCookie(cookie: string): boolean {
  return !cookie.split(";").some((entry) => entry.trim() === `${SIDEBAR_COOKIE_NAME}=false`);
}

export function sidebarCookie(open: boolean): string {
  return `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
}

type SidebarKeyboardEvent = Pick<
  KeyboardEvent,
  | "key"
  | "defaultPrevented"
  | "repeat"
  | "isComposing"
  | "metaKey"
  | "ctrlKey"
  | "altKey"
  | "shiftKey"
>;

export function isSidebarShortcut(
  event: SidebarKeyboardEvent,
  shortcut: string | null,
  typing: boolean,
): boolean {
  return Boolean(
    shortcut &&
    !typing &&
    !event.defaultPrevented &&
    !event.repeat &&
    !event.isComposing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === shortcut.toLowerCase(),
  );
}
