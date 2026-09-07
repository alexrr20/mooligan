import { getRandomValues, randomUUID } from "expo-crypto";

// Hermes has no Web Crypto global. LiveStore's browser exports use these two
// standard functions; both use the Device's native cryptographic generator.
Object.defineProperty(globalThis, "crypto", {
  value: { getRandomValues, randomUUID },
  configurable: true,
});
