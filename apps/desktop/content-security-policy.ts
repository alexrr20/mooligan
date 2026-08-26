export const productionServiceOrigin = "https://mooligan-api.bessa.workers.dev";
export const productionSyncOrigin = "wss://mooligan-api.bessa.workers.dev";

export const developmentContentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000 ws://127.0.0.1:5173; img-src 'self' data: mooligan-image: mooligan-set-symbol:; object-src 'none'; base-uri 'none'";

export const productionContentSecurityPolicy = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self' ${productionServiceOrigin} ${productionSyncOrigin}; img-src 'self' data: mooligan-image: mooligan-set-symbol:; object-src 'none'; base-uri 'none'`;
