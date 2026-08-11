# Mooligan

A local-first Electron app for managing Magic: The Gathering cards, with an
optional Better Auth account for synchronization. Creating an account is not a
prerequisite for using the desktop app.

- `apps/desktop`: Electron, React 19, TanStack Router, StyleX, and Motion
- `apps/api`: Hono 4 for Cloudflare Workers, served locally by Wrangler on
  `http://127.0.0.1:3000`
- `packages/domain`: shared catalog, collection, deck, list, and market types

Node.js 22.18 or newer is required.

## Local-first behavior

Mooligan creates a durable SQLite workspace under Electron's user-data
directory on first launch. The workspace and its preferences remain usable
without signing in, without the API running, and after signing out. Its stable
local ID is not an anonymous online account.

The user-owned workspace is separate from the replaceable Scryfall catalog
database. Signing in binds a local workspace to an online identity and enables
preference sync; SQLite remains the working copy, so an expired session or
network outage pauses sync rather than blocking local reads and writes. Account
switches use separate local workspaces to avoid mixing user data.

## Development

Install dependencies, apply the local D1 schema, then start the API and
Electron together:

```bash
vp install
vp run api#db:migrate:local
vp run dev
```

The baseline migration creates the catalog release, Better Auth, and
workspace-sync tables in Wrangler's local D1 database. It targets a fresh
database; while the schema is still pre-release, recreate local D1 rather than
carrying forward obsolete migration history.

### Optional account setup

Account-free development needs no OAuth credentials. To exercise sign-in, copy
the local secret template and replace every placeholder:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
openssl rand -base64 32
```

Use the generated value for `BETTER_AUTH_SECRET`, then add a Google OAuth web
client's ID and secret. Register this exact local redirect URI with Google:

```text
http://127.0.0.1:3000/api/auth/callback/google
```

Do not commit `.dev.vars`. The local Worker at `http://127.0.0.1:3000` serves
both the small hosted sign-in page and `/api/auth/*`; its other API routes run
through the Worker as usual. The auth page is built automatically by the API's
development, test, build, and deploy tasks.

The migration creates a lightweight release record. With the API running, the
first request bootstraps it from Scryfall:

```bash
curl "http://127.0.0.1:3000/catalog/release"
```

The Worker repeats that check every six hours in production. It stores only the
current Scryfall release metadata in D1. The desktop downloads Scryfall's
`default_cards` JSONL gzip archive directly, streams it into a temporary SQLite
database, validates it, and atomically replaces the installed catalog. A failed
check or import leaves the existing offline catalog untouched.

Desktop builds read the catalog service from `MOOLIGAN_API_URL` and the auth
service from `MOOLIGAN_AUTH_ORIGIN`. Local development defaults both to
`http://127.0.0.1:3000`; release builds default both to the production Worker.
Explicit values present while building override those defaults and are embedded
in the packaged main process, so installed apps do not depend on shell
configuration. The auth value must be an origin with no path, query,
credentials, or fragment. It must use HTTPS except for the loopback hosts
`127.0.0.1`, `localhost`, and `[::1]` during development.

### Verify sign-in locally

1. Start Mooligan and the Worker with `vp run dev`.
2. From Settings, start Google sign-in. Authentication opens in the system
   browser, never inside the privileged Electron window.
3. Complete Google sign-in. The browser returns through the exact custom
   protocol `com.mooligan.app`; the callback shape is
   `com.mooligan.app://auth/callback#token=<authorization-token>`.
4. Quit and relaunch the app to verify session restoration. Then sign out and
   confirm the local workspace and its preferences remain present.

Also disconnect the Worker while editing a preference: the local save should
succeed immediately and sync should resume after reconnecting. Session cookies,
PKCE material, and authorization codes must never appear in renderer storage or
the renderer-facing API.

The Worker and hosted page use the official `@better-auth/electron` plugin. The
desktop side intentionally uses a narrow main-process client over that plugin's
public endpoints instead of its preload client: Mooligan requires asynchronous
`safeStorage`, persisted PKCE before browser launch, and no credential-bearing
renderer API. A Worker integration test covers the real transfer, PKCE
exchange, session cookie, and session lookup contract.

## Validation

Format, lint, type-check, test, and build every workspace:

```bash
vp run ready
```

The individual commands remain available when needed:

```bash
vp check
vp run -r test
vp run -r build
```

These automated checks do not prove operating-system protocol registration or
the system-browser round trip. `vp run desktop#package` creates an unpacked
platform build with the `com.mooligan.app` scheme metadata for smoke testing;
test the deep-link path in a signed installer on every supported platform
before release.

## Production build

Build both workspaces:

```bash
vp run -r build
```

Deploy the API to Cloudflare:

```bash
vp run api#db:migrate
vp run api#deploy
```

The production Worker origin and its trusted origins are committed in
`apps/api/wrangler.jsonc`. No localhost auth origin is compiled into the
deployed Worker:

- `BETTER_AUTH_URL` is `https://mooligan-api.bessa.workers.dev`.
- `BETTER_AUTH_TRUSTED_ORIGINS` contains only that exact HTTPS origin and
  `com.mooligan.app:/`.
- Store `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` as
  Cloudflare Worker secrets. Never put production values in the repository.
- Register `${BETTER_AUTH_URL}/api/auth/callback/google` as the production
  Google OAuth redirect URI.
- Configure `MOOLIGAN_API_URL` and `MOOLIGAN_AUTH_ORIGIN` in the released
  desktop app to use the same HTTPS Worker origin.

Set the credential-bearing production secrets interactively from the API
workspace:

```bash
cd apps/api
vp exec wrangler secret put BETTER_AUTH_SECRET
vp exec wrangler secret put GOOGLE_CLIENT_ID
vp exec wrangler secret put GOOGLE_CLIENT_SECRET
```

Apply the baseline schema to a fresh remote database before deploying. The
first catalog request populates an empty release record from Scryfall and
returns `503` only if that bootstrap check fails.

The desktop packaging configuration registers the exact `com.mooligan.app` URL
scheme and defaults release builds to the production Worker. Override the
service origins only when targeting another deployment:

```bash
MOOLIGAN_API_URL=https://mooligan-api.bessa.workers.dev \
  MOOLIGAN_AUTH_ORIGIN=https://mooligan-api.bessa.workers.dev \
  vp run desktop#dist
```

Platform signing—and notarization where applicable—still requires external
release credentials. A production OAuth end-to-end test therefore also
requires real Google credentials, a deployed HTTPS origin, and the relevant
platform signing account.

Run the compiled desktop:

```bash
vp run desktop#start
```
