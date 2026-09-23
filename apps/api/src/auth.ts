import { expo } from "@better-auth/expo";
import { electron } from "@better-auth/electron";
import { betterAuth } from "better-auth";
import { v7 as uuidv7 } from "uuid";
import { Option, Schema } from "effect";

const isEncodedOrigins = Schema.is(Schema.String);
const decodeTrustedOrigins = Schema.decodeUnknownOption(
  Schema.Array(Schema.String).pipe(
    Schema.itemsCount(2),
    Schema.filter((origins) => new Set(origins).size === origins.length),
  ),
);

export function createAuth(environment: Env) {
  const baseURL = authOrigin(environment.BETTER_AUTH_URL);

  return betterAuth({
    appName: "Mooligan",
    baseURL,
    database: environment.DB,
    secret: environment.BETTER_AUTH_SECRET,
    socialProviders: {
      google: {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
      },
    },
    trustedOrigins: trustedOrigins(environment.BETTER_AUTH_TRUSTED_ORIGINS, baseURL),
    rateLimit: {
      enabled: true,
      max: 100,
      storage: "database",
      window: 60,
    },
    advanced: {
      database: {
        generateId: () => uuidv7(),
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
    plugins: [electron(), expo()],
  });
}

function authOrigin(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute origin.");
  }

  if (
    url.origin === "null" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback(url.hostname)))
  ) {
    throw new Error("BETTER_AUTH_URL must be an HTTPS origin.");
  }

  return url.origin;
}

function trustedOrigins(value: string | readonly string[], baseURL: string) {
  let parsed = value;

  if (isEncodedOrigins(value)) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must be a JSON array.");
    }
  }

  const origins = decodeTrustedOrigins(parsed);
  if (
    Option.isNone(origins) ||
    !origins.value.includes(baseURL) ||
    !origins.value.includes("com.mooligan.app:/")
  ) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS must contain only Mooligan's exact origins.");
  }

  return [baseURL, "com.mooligan.app:/"];
}

function isLoopback(hostname: string) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
}
