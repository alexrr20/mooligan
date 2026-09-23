# Mooligan

A local-first Electron app for managing Magic: The Gathering cards. A Better
Auth account can synchronize one personal Workspace, but an account is not a
prerequisite for using the desktop app.

- `apps/desktop`: Electron, React 19, TanStack Router, StyleX, and Motion
- `apps/mobile`: Expo SDK 57, React Native, and Expo Router for iOS and Android
- `apps/api`: Hono 4 for Cloudflare Workers, served locally by Wrangler on
  `http://127.0.0.1:3000`
- `packages/domain`: shared catalog, collection, deck, list, and market types
- `packages/catalog`: shared offline catalog SQL, validation, and price import logic
- `packages/workspace`: shared LiveStore events, state, and backup schema
- `packages/account`: shared Account binding, sync credentials, and Workspace registry
- `packages/presentation`: shared display labels, palettes, and formatting for both apps

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
current device. Workspace backup version 9 contains only materialized
collection lots, decks with their card entries, card tags, category templates, profile choices, price provider preferences, and spoiler state, and every restore creates a new unbound
workspace before activation.

## Card prices

Desktop card details include a Prices tab for paper Printings, showing each
market's retail and buylist prices by finish and currency. MTGJSON supplies the
daily data, including Cardmarket, TCGplayer, Card Kingdom, and Mana Pool when
present in the feed. Missing prices remain unavailable. Price dates are shown
beside each amount; older observations are marked stale. These are reference
estimates, without adjustments for a Holding's condition or language.

Settings → Card prices lets users enable or disable individual price providers
for printing price labels and the Prices tab. The selection belongs to the active Workspace and may be
empty. It works offline and syncs across Devices when the Workspace is bound to
an Account. Each provider toggle is a separate synced event, so edits to different
providers merge; conflicting edits to the same provider follow synced event order.
All providers start enabled in a new Workspace. The previous Device-local
selection is no longer read and must be selected again. This display preference does not change bulk
downloads or the explicit market used by currency-based search filters.

Printing labels show the lowest saved retail price from enabled providers,
converted to the default currency selected in Settings. EUR is the initial default;
USD, GBP, CAD, AUD, JPY, and CHF are also available. The selection syncs with the
Workspace. ECB reference rates from Frankfurter are cached daily on the Device;
converted estimates show ≈, and missing rates are reported instead of comparing
unconverted amounts. Collection holdings and deck entries match their
finish; other printings show a “From” price across finishes. Values are per copy,
with the source market shown and the finish and date available on hover. Protected
previews stay concealed, and disabling every provider hides these labels.

The desktop checks for updates on launch and hourly while running, downloading
`AllPricesToday.json.gz` when its last successful import is at least 24 hours old.
Settings and the Prices tab also offer a manual update. The first import downloads
`AllIdentifiers.json.gz`, currently about 218 MB compressed, to map MTGJSON UUIDs
to Scryfall Printing IDs. The saved mapping refreshes weekly. New unmapped records
remain unpriced until a mapping refresh. Duplicate face records with equal prices
collapse into one observation; conflicting observations are omitted.

A worker streams the gzip JSON files into a staging database. It validates the
release and installs prices and metadata in one SQLite transaction. Readers keep
using the previous snapshot during downloads or failures. Prices and identifier
mappings live in the Device's `prices.sqlite`, separate from the catalog and
Workspace. They survive catalog replacement and sign-out, and are excluded from
Workspace events, synchronization, and backups.

Paper price searches now use this same MTGJSON snapshot: `usd`, `usd_foil`, and
`usd_etched` use TCGplayer retail; `eur`, `eur_foil`, and `eur_etched` use Cardmarket
retail. This changes results from the previous Scryfall catalog prices. Before
the first price import, these filters have no matches. Digital `tix` searches
continue to use the Scryfall catalog. Historical charts and Collection/Deck
valuation summaries are not part of this layer.

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

Mana analysis is available in desktop and mobile deck views. It includes a nonland
mana curve, averages with and without lands, color pip demand versus land or all
mana sources, opening-hand land distributions, land availability by turn, and an
exact/at-least/at-most draw calculator for lands, colored land sources, or individual cards.
The feature set draws on [Moxfield's mana statistics](https://github.com/moxfield/moxfield-public/wiki/Features)
and [Archidekt's deck statistics](https://archidekt.com/news/9287631).

Calculations run locally from the installed catalog and update with deck edits.
Curves and costs include commanders; sources and draw odds use only the main-deck
library. Modal land backs count as land options. Source counts use Scryfall's
`produced_mana`, counting each card once per available color, including conditional
abilities, without inferring fetch targets or tokens. Hybrid pips split between
colors; Phyrexian pips count as colored. Draw odds use sampling without replacement,
before mulligans, and do not model tapped lands, color payment, ramp, or land
sequencing. Protected or unavailable library cards suppress probabilities until
the data is complete.

Text import accepts quantity/name lists, Arena set and collector numbers, MTGO
`SB:` lines, and section headings. Check the import before adding it. Unresolved
names block the import. Text exports include `[printing:ID]` and `[finish:VALUE]`
references so they can round trip through Mooligan even when that printing is
absent from the local catalog or spoiler-protected. Exact unavailable references
are retained with a warning. Workspace backups also retain deck metadata, card tags, assignments, and category templates.
Text exports contain cards only; use a workspace backup to preserve tagging.

Decks use the same persistent LiveStore event log and optional account sync as
the collection. Concurrent additions to a matching slot add quantities. Metadata
and entry edits only change the submitted fields; conflicting absolute edits to
the same field resolve in the synchronized event order. Merged card IDs remain
addressable by later offline edits. Removed cards cannot be revived by stale
edits, and deleted decks reject later card additions and metadata changes.

Card tags have two scopes: categories for one deck and global tags for the whole
workspace. Assign several roles to a card, choose a color, filter for a tag or
untagged cards, and group cards by tags. Both desktop and mobile support bulk
selection, tag editing and deletion, and creating, applying, updating, and deleting
category templates. Starter categories cover ramp, draw, removal, board wipes,
protection, and finishers. Applying a template adds missing category names and
leaves existing colors and assignments intact. Deck duplication copies local
categories and assignments; global tags already apply to the copied cards.

Assignments use the card's shared rules identity, so switching printings or
finishes keeps tags. A printing without a shared identity uses its own card ID.
Tags never change a deck card's section or quantity. Cards can appear in several
tag groups, but deck totals still count each copy once. Protected and unavailable
printings do not expose tags in card views. Deleting a deck removes its local
categories and assignments; global tags and templates remain available.

The workspace event schema is now version 7, which stores deck text trimmed, identifiers
without surrounding whitespace, and timestamps in UTC ISO form. Deploy the updated API alongside
the clients. Older clients must update before syncing; their local workspace remains available.
Backup version 9 replaces version 8, with no backward compatibility for old backup files.

## Profile

Signed-in users can open their profile from the header when their account workspace
is active. Unbound workspaces have no profile entry, and direct profile navigation
returns them to Home. Sign-out also closes access to the profile.

The profile displays collection counts, card previews, and active decks. Users can
pin four distinct printings they own, replace or unpin them, and choose banner
artwork from the catalog. Protected previews remain concealed. Printings no longer
owned leave an empty featured slot. Profile choices persist in the workspace event
log, sync between devices, and are included in backups. Profiles are not published
as public pages.

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
`apps/mobile/app.json`. Neither directory is committed. Mobile creates a persistent local Workspace
and uses Better Auth’s Expo client to sign in and sync its Account Workspace.
Mobile includes offline catalog search, card details, Collection and Deck editing,
previews, Profile choices, prices, and Workspace backups. Both clients use the
same catalog queries and Workspace editing rules. See
[mobile setup](apps/mobile/README.md) for the public service origin, native
rebuild requirements, and verification steps.

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

Workspace backup version 9 is the only supported backup format. Export a backup
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
