export function accountConfiguration(origin: string | undefined) {
  if (!origin) return null;
  const url = new URL(origin);
  if (
    url.origin === "null" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))
  )
    throw new Error("The configured authentication origin is invalid.");
  const authOrigin = url.origin;
  const syncUrl = new URL("/api/sync", authOrigin);
  syncUrl.protocol = syncUrl.protocol === "https:" ? "wss:" : "ws:";
  return { authOrigin, syncUrl: syncUrl.href };
}
