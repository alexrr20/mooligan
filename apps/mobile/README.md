# Mooligan mobile

The iOS and Android app uses Expo development builds. Search, card details,
Collection editing, Deck building, previews, Profile choices, price preferences,
and Workspace backups use the same domain and Workspace logic as desktop.

## Run

From the repository root:

```bash
vp install
vp run mobile#ios
# or
vp run mobile#android
```

Rebuild the native client for this change. Document Picker, Sharing, and Image
join the existing SQLite, Crypto, SecureStore, Network, and WebBrowser modules.
After rebuilding, JavaScript changes only need `vp run mobile#dev`.
Expo generates `ios/` and `android/` from `app.json`; neither is committed.
Android builds require JDK 17. On Apple silicon with Homebrew:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  vp run mobile#android
```

## Local workflows

- Search, Collection, and Decks offer list and grid views saved on the Device.
- Search supports the desktop Scryfall query syntax, unique cards or all
  printings, digital cards, tokens, art series, ad cards, and universe filters.
- Card details include ordered faces, Oracle text, sibling printings, format
  legality, market prices, and actions to add paper copies or Deck cards.
- Collection has name, set, finish, language, and condition filters, with name,
  set, and quantity sorting. Edit or remove unattributed Holdings without changing Decks.
- Decks support name, format, tags, notes, archived status, search, duplication,
  deletion, and exact printing/finish quantities in all five sections. Details
  show Collection coverage, lands, nonlands, and average mana value. Text
  imports must be checked before committing. Export uses the desktop format.
- Upcoming releases support revealing or protecting a printing or release
  family. The same protection applies to search, images, Collection, Decks,
  and Profile cards.
- A signed-in Account Workspace can pin four owned printings and choose
  banner artwork. These choices are private, as on desktop.
- Settings export and restore desktop-compatible version 7 Workspace backups
  through the native file picker and share sheet. Restore validates and verifies
  a separate unbound Workspace before activation, retaining the previous one.

## Catalog and prices

Choose **Download card catalog** on Search for the initial offline catalog.
Settings can replace it with a newer Scryfall release. Downloads stream gzip
records from a temporary file into a staging SQLite database, then validate the
catalog before committing the installed database pointer. Failed downloads leave
the previous catalog and all user-owned data intact. Abandoned reference imports
are removed on the next app launch.

Catalog SQL, import validation, Collection queries, spoiler visibility, and
price imports live in `@mooligan/catalog`. Desktop supplies Node SQLite;
mobile supplies Expo SQLite. Mobile uses bounded gzip chunks instead of loading
an entire bulk feed into JavaScript memory. Queries run against the installed
local catalog. Images are cached on disk as they are viewed; an image that has
not been cached needs a connection, and the OS can reclaim image cache space.

The first price import is started explicitly in Settings or a card's Prices
view. It includes MTGJSON's large identifier download. After that, the app checks
for daily price updates on foreground resume and hourly while active. Provider
choices and default currency sync; price files, cached images, exchange rates,
and appearance stay on the Device. Prices match desktop's market, finish,
currency-conversion, and date rules.

## Account and sync

Mobile defaults to the same production API as the desktop release,
`https://mooligan-api.bessa.workers.dev`. Sign in with the same Google Account
on both Devices to open its Workspace. Without an Account, all core workflows
remain local. Sign-out stops sync and keeps local data available.

For the local API, start Metro with:

```bash
EXPO_PUBLIC_MOOLIGAN_AUTH_ORIGIN=http://127.0.0.1:3000 \
  vp run mobile#dev
```

Use a reachable HTTPS origin on a physical Device. On the iOS simulator,
loopback reaches the local API; Android needs `adb reverse tcp:3000 tcp:3000`.
The sync URL is derived from the same origin as `/api/sync`. An explicitly empty
origin disables Account sign-in. Invalid origins leave the Workspace local and
show a configuration error. OAuth and Worker setup are in the root README.

The URL scheme is `com.mooligan.app`. Better Auth's Expo client handles Google
sign-in, browser callbacks, session caching, and cookies in SecureStore.
Credentials never enter AsyncStorage, backups, or the Workspace event log.
The SQLite Workspace registry and LiveStore event log are separate databases.

`@mooligan/account` shares binding and credential-renewal rules. Signing in binds
the active unbound Workspace or opens the Account's existing Workspace while
retaining the local one. Settings can reopen retained Workspaces. Short-lived
sync credentials renew before expiry; foreground resume and retries restore
connections. Schema mismatches pause sync without deleting local data.

Both clients commit the same events. Concurrent additions to matching Holdings
and Deck slots add quantities. Independent metadata and provider changes merge;
conflicting absolute changes resolve in synced event order. Removed cards and
deleted Decks reject stale edits. Catalog downloads and Account availability do
not block local Workspace edits.

## Verification

```bash
vp check
vp test
vp run -r test
vp run mobile#build
```

Optional [Maestro](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli)
flows exercise native Deck creation, duplication, deletion, catalog installation,
card search, Collection edits, and persistence across restart. Run them against a
development build with Metro running and an empty, unbound test Workspace:

```bash
maestro test apps/mobile/test/workspace-smoke.yaml
maestro test apps/mobile/test/catalog-smoke.yaml
```

The catalog flow downloads the full catalog if needed. Both flows remove the
Workspace records they create. The optional price flow downloads real market
feeds and retains the installed prices:

```bash
maestro test apps/mobile/test/prices-smoke.yaml
```

For a real Account smoke test, sign in on mobile and desktop, edit a Collection
holding and Deck on each, and check both directions. Disconnect both Devices,
make independent edits, then reconnect and check convergence. Sign out, restart
offline, and confirm the saved data remains. Automated sync tests cover event
convergence and authentication lifecycle; they do not complete a real Google
browser round trip or test physical-device background suspension.

Native APIs follow the [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
and [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) contracts.
