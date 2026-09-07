// Better Auth's Expo plugin consumes the browser result. Keep its cookies out
// of Expo Router's navigation state when Android also delivers the deep link.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, "com.mooligan.app://");
    if (
      url.protocol === "com.mooligan.app:" &&
      (url.hostname === "settings" || (!url.hostname && url.pathname === "/settings"))
    )
      return "/settings";
  } catch {
    // Leave unrelated links to Expo Router.
  }
  return path;
}
