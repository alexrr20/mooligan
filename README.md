# Mooligan

A local-first Electron app for managing Magic: The Gathering cards. A Better
Auth account can synchronize one personal Workspace, but an account is not a
prerequisite for using the desktop app.

- `apps/desktop`: Electron, React 19, TanStack Router, StyleX, and Motion
- `apps/mobile`: Expo SDK 57, React Native, and Expo Router for iOS and Android
- `apps/api`: Hono 4 for Cloudflare Workers, served locally by Wrangler on
  `http://127.0.0.1:3000`
- `packages/domain`: shared catalog, collection, deck, list, and market types
- `packages/workspace`: shared LiveStore events, state, and backup schema

Node.js 22.18 or newer is required.

## Local-first behavior

Mooligan stores collection lots and spoiler decisions in a renderer LiveStore
that persists to OPFS. A small Electron-owned SQLite registry stores the stable
device ID, known workspace IDs, account bindings, and the active workspace. The
workspace remains usable without signing in, without the API running, and after
signing out. Its stable local ID is not an anonymous online account.

Mooligan refuses LiveStore's in-memory fallback if OPFS cannot open. It shows a
reload screen and leaves the last persistent event log untouched. This is
deliberate. Collection, deck, or spoiler changes must never appear saved when they
would disappear after a restart.

The user-owned workspace is separate from the replaceable Scryfall catalog
database. Motion and view preferences stay in renderer local storage on the
current device. Workspace backup version 4 contains only materialized
collection lots, decks with their card entries, and spoiler state, and every restore creates a new unbound
workspace before activation.

## Decks

The Decks page creates, searches, filters, duplicates, archives, and deletes decks.
Each deck has a name, format, tags, notes, and exact printing/finish quantities in
main deck, sideboard, commander, companion, and maybeboard sections. Add cards
through the local catalog search or the card detail page. Editing a deck never
changes collection ownership.

Collection coverage counts exact printings and finishes across the deck, excludes
the maybeboard, and does not reserve copies against other decks. The summary
shows main-deck lands, nonlands, and average nonland mana value. Card legality
labels come from the installed catalog; they are not a full deck-construction
rules validator.

Text import accepts quantity/name lists, Arena set and collector numbers, MTGO
`SB:` lines, and section headings. Check the import before adding it. Unresolved
names block the import. Text exports include `[printing:ID]` and `[finish:VALUE]`
references so they can round trip through Mooligan even when that printing is
absent from the local catalog or spoiler-protected. Exact unavailable references
are retained with a warning. Workspace backups also retain deck metadata.

Decks use the same persistent LiveStore event log and optional account sync as
the collection. Concurrent additions to a matching slot add quantities. Metadata
and entry edits only change the submitted fields; conflicting absolute edits to
the same field resolve in the synchronized event order. Merged card IDs remain
addressable by later offline edits. Removed cards cannot be revived by stale
edits, and deleted decks reject later card additions and metadata changes.

The workspace event schema is now version 2. Deploy the updated API alongside
the desktop client to enable deck sync. Older clients must update before syncing;
their local workspace remains available. Backup version 4 replaces version 3,
with no backward compatibility for old backup files.

## Development

Install dependencies, apply the local D1 schema, then start the API and
Electron together:

```bash
vp install
vp run api#db:migrate:local
vp run dev
```

The mobile client runs separately so normal desktop and API development does
not start Metro. Build and install its native development client on a simulator
or connected Device:

```bash
vp run mobile#ios
vp run mobile#android
```

After the native client is installed, JavaScript and asset changes only need
Metro:

```bash
vp run mobile#dev
```

Expo generates `apps/mobile/ios` and `apps/mobile/android` locally from
`apps/mobile/app.json`. Neither directory is committed. The mobile foundation
does not create or synchronize a Workspace yet.

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

Use separate generated values for `BETTER_AUTH_SECRET` and
`SYNC_CREDENTIAL_SECRET`, then add a Google OAuth web client's ID and secret.
Register this exact local redirect URI with Google:

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

The Worker checks Scryfall whenever the desktop requests the current catalog
release and every six hours in production. It stores only the current Scryfall
release metadata in D1. If Scryfall is temporarily unavailable, the Worker
returns its cached release. The desktop downloads Scryfall's `default_cards`
JSONL gzip archive directly, streams it into a temporary SQLite database,
validates it, and atomically replaces the installed catalog. A failed import
leaves the existing offline catalog untouched.

Desktop builds read the catalog service from `MOOLIGAN_API_URL`, the auth
service from `MOOLIGAN_AUTH_ORIGIN`, and the LiveStore endpoint from
`MOOLIGAN_SYNC_URL`. Local development defaults them to the local Worker;
release builds default them to the production Worker. Explicit values present
while building override those defaults and are embedded in the packaged app, so
installed apps do not depend on shell configuration. The auth value must be an
origin with no path, query, credentials, or fragment. It must use HTTPS except
for the loopback hosts `127.0.0.1`, `localhost`, and `[::1]` during development.

### Verify sign-in locally

1. Start Mooligan and the Worker with `vp run dev`.
2. From Settings, start Google sign-in. Authentication opens in the system
   browser, never inside the privileged Electron window.
3. Complete Google sign-in. The browser returns through the exact custom
   protocol `com.mooligan.app`; the callback shape is
   `com.mooligan.app://auth/callback#token=<authorization-token>`.
4. Quit and relaunch the app to verify session restoration. Then sign out and
   confirm the local workspace remains present.

Also disconnect the Worker while editing collection or spoiler state. Local
reads and writes should continue. Session cookies, PKCE material, and
authorization codes must never appear in renderer storage or the
renderer-facing API.

### Verify synchronization locally

The development desktop connects to `ws://127.0.0.1:3000/api/sync`. After the
local migration and sign-in setup above:

1. Start the API and desktop with `vp run dev`.
2. Sign in on one desktop profile. If the Account has no Workspace, Mooligan
   binds the active unbound Workspace. Otherwise it opens the Account's existing
   Workspace and retains the prior local Workspace.
3. Start a second Electron profile against the same Worker, sign in to the same
   Account, and confirm collection and spoiler edits arrive in both directions.
4. Stop Wrangler, edit on both profiles, restart Wrangler, and confirm the
   changes converge. Local reads and writes must work while Wrangler is stopped.
5. Sign out. The active Workspace and its local data must remain available with
   synchronization disabled.

Every sync credential lasts five minutes. The desktop requests it with its app
version and Workspace event-schema version. The API returns HTTP 426 with
`client_upgrade_required` when that schema version is below the supported
minimum, or HTTP 409 with `server_upgrade_required` when it is above the
supported maximum. The desktop pauses sync and keeps local editing available.

### Reset development data

Workspace backup version 4 is the only supported backup format. Export a backup
from Settings before resetting any data you care about.

For an unbound development Workspace, quit Mooligan, clear the renderer origin's
site data from Electron DevTools, and reopen the app. This removes LiveStore's
OPFS data and device-local renderer preferences. It does not remove the card
catalog, protected Account session, or Electron-owned Workspace registry.

For a complete pre-release reset, quit Mooligan and move its operating-system
user-data directory aside before relaunching. The usual directory is
`~/Library/Application Support/Mooligan` on macOS, `%APPDATA%\Mooligan` on
Windows, and `$XDG_CONFIG_HOME/Mooligan` or `~/.config/Mooligan` on Linux. Moving
the directory keeps the old files recoverable. The project does not migrate
development-era Workspace registries or backup versions 1 through 3.

Deleting local Wrangler Durable Object state changes the sync backend identity.
Mooligan shuts down that sync connection without clearing its local event log.
Do this only for development. Clear or replace each affected client Workspace
explicitly before connecting it to the new backend.

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

Run the repeatable LiveStore scale measurement separately:

```bash
vp run desktop#measure:livestore
```

It measures the configured 100,000-lot and 100,000-spoiler-decision backup
limits, cold state open, initial projection, a one-lot edit, a 100,000-event
remote pull, and event-log growth under repeated edits. The checked-in release
gate record explains which measurements have stable automated thresholds.

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
service URLs only when targeting another deployment:

```bash
MOOLIGAN_API_URL=https://mooligan-api.bessa.workers.dev \
  MOOLIGAN_AUTH_ORIGIN=https://mooligan-api.bessa.workers.dev \
  MOOLIGAN_SYNC_URL=wss://mooligan-api.bessa.workers.dev/api/sync \
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
