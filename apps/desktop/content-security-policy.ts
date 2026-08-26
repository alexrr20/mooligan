export const defaultPackagedServiceOrigin = "https://mooligan-api.bessa.workers.dev";
export const defaultPackagedSyncUrl = "wss://mooligan-api.bessa.workers.dev/api/sync";

export const developmentContentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000 ws://127.0.0.1:5173; img-src 'self' data: mooligan-image: mooligan-set-symbol:; object-src 'none'; base-uri 'none'";

export function packagedContentSecurityPolicy(syncUrl: string) {
  const url = new URL(syncUrl);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("MOOLIGAN_SYNC_URL must use the ws: or wss: protocol.");
  }

  return `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self' ${url.origin}; img-src 'self' data: mooligan-image: mooligan-set-symbol:; object-src 'none'; base-uri 'none'`;
}
