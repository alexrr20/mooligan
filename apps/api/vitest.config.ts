import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus";

const testSecrets = {
  BETTER_AUTH_TRUSTED_ORIGINS: JSON.stringify(["http://127.0.0.1:3000", "com.mooligan.app:/"]),
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  BETTER_AUTH_SECRET: "test-only-".repeat(6),
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  SYNC_CREDENTIAL_SECRET: "test-sync-credential-secret-".repeat(2),
};

Object.assign(process.env, testSecrets);

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        bindings: {
          ...testSecrets,
          TEST_MIGRATIONS: await readD1Migrations(
            new URL("./migrations", import.meta.url).pathname,
          ),
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});
