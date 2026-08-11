# Scryfall Catalog with MTGJSON Prices

Status: ready for implementation

## Agent objective

Add current paper-market prices to Mooligan without changing the existing
Scryfall catalog or image pipeline. MTGJSON is a price ingestion source only.
The desktop must download a compact Mooligan-owned snapshot, retain the last
valid snapshot offline, and update it in the background without prompting the
user each day.

Read `AGENTS.md` and `PROJECT.md`, run `vp install`, and inspect the current
catalog, preference, IPC, and API release paths before editing. Preserve
unrelated worktree changes. Implement the phases below in order and leave each
phase testable.

## Fixed decisions

```text
Scryfall default_cards JSONL.gz
    -> existing cards.sqlite
    -> card identity, search, metadata, and image URLs

MTGJSON AllPrintings.parquet + AllPricesToday.parquet
    -> scheduled GitHub Actions transformation
    -> compact prices.sqlite.gz keyed by Scryfall ID
    -> private R2 bucket
    -> Worker manifest/file routes
    -> replaceable desktop prices.sqlite cache
```

- Scryfall remains the canonical catalog and sole image source.
- MTGJSON source files are never downloaded by desktop clients.
- The expensive join runs in GitHub Actions, not in the Cloudflare Worker.
  Workers currently have a 128 MB isolate memory limit, so the Worker should
  only validate a small manifest and stream an R2 object.
  [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- The market cache is reference data. It is separate from the Scryfall catalog,
  the user workspace, cloud sync, and workspace backups.
- Publish a prebuilt portable SQLite database rather than JSON that every
  desktop must parse and re-index.
- Do not add a generic provider interface, factory, adapter registry, or plugin
  system. There is one MTGJSON feed and one local SQLite implementation.

MTGJSON currently publishes the required datasets in Parquet, and
`AllPrintings` exposes `identifiers.scryfallId` while `AllPricesToday` is keyed
by MTGJSON UUID. Use those fields as the off-device join.
[MTGJSON downloads](https://mtgjson.com/downloads/all-files/)
[MTGJSON identifiers](https://www.mtgjson.com/data-models/identifiers/)

## Version-one product scope

Include only:

- Paper retail prices.
- Exact Scryfall printings.
- Providers `cardkingdom`, `cardmarket`, `manapool`, and `tcgplayer`.
- Finishes `nonfoil`, `foil`, and `etched`; transform MTGJSON `normal` to
  Mooligan `nonfoil`.
- Provider-native USD and EUR prices. Do not perform currency conversion.
- One preferred provider, defaulting to `cardmarket`.
- Automatic price updates, enabled by default.
- The current snapshot date, provider attribution, and `via MTGJSON` in the UI.

Explicitly exclude:

- Buylist, MTGO/Cardhoarder, price history, trends, averages, conditions, and
  sealed-product prices.
- Automatic fallback to another provider when the selected provider has no
  quote.
- Collection or deck valuation.
- Prices in the `One print per card` search mode, because its representative
  printing is arbitrary.
- Incremental/delta downloads. Measure the compact full snapshot before adding
  that complexity.
- Client downloads of `AllPrintings`, `AllIdentifiers`, or `AllPricesToday`.

Acquisition cost on a collection lot remains user-owned data and must not be
overwritten or conflated with market price.

## Data contracts

### Shared domain

Revise `packages/domain/src/market.ts` and export its additions from
`packages/domain/src/index.ts`.

Define:

- `MarketProviderSchema`: the four provider literals above.
- `MoneySchema`: retain the generic three-letter currency but require a
  non-negative safe integer `amountMinor`.
- `PriceQuoteSchema`: `printingId`, `provider`, `finish`, `observedOn`, and
  `price`. Replace the current ambiguous `source` and timestamp-based
  `observedAt`; no compatibility path is required.
- `MarketReleaseSchema` with exactly:

```ts
{
  schemaVersion: 1;
  source: "mtgjson";
  sourceVersion: string;
  observedOn: string; // ISO YYYY-MM-DD
  generatedAt: string; // ISO datetime
  artifactPath: string; // same-origin /market/files/...sqlite.gz path
  compressedSize: number;
  sha256: string; // 64 lowercase hexadecimal characters
  quoteCount: number;
  printingCount: number;
}
```

Validate `artifactPath` with a strict same-origin path pattern and cap
`compressedSize` at 64 MiB. This cap is an intentional v1 safety ceiling; raise
it only if a real generated artifact requires it.

### Published SQLite artifact

The builder must create this database deterministically:

```sql
PRAGMA user_version = 1;

CREATE TABLE market_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  source_version TEXT NOT NULL,
  observed_on TEXT NOT NULL,
  quote_count INTEGER NOT NULL CHECK (quote_count > 0),
  printing_count INTEGER NOT NULL CHECK (printing_count > 0)
);

CREATE TABLE price_quotes (
  printing_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (
    provider IN ('cardkingdom', 'cardmarket', 'manapool', 'tcgplayer')
  ),
  finish TEXT NOT NULL CHECK (finish IN ('nonfoil', 'foil', 'etched')),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  PRIMARY KEY (printing_id, provider, finish)
) WITHOUT ROWID;
```

The primary key is also the quote lookup index; do not add another index until
a measured query needs one. Store the snapshot date once in `market_meta`, not
on every quote row.

## Phase 1: Domain contract

Likely files:

```text
packages/domain/src/market.ts
packages/domain/src/index.ts
packages/domain/test/schemas.test.ts
```

Tasks:

1. Implement the schemas above.
2. Add focused schema tests for providers, ISO dates, safe/non-negative money,
   checksum shape, same-origin artifact paths, and the archive-size ceiling.
3. Remove the obsolete `observedAt`/free-form `source` contract instead of
   preserving an alias or fallback.

Acceptance criteria:

- Invalid provider, date, checksum, path, amount, or oversized release values
  are rejected.
- Existing domain tests remain green.

## Phase 2: Deterministic snapshot builder

Add a small standalone Python tool rather than another application workspace:

```text
tools/market/build_snapshot.py
tools/market/test_build_snapshot.py
tools/market/requirements.txt
```

Use Python's standard `sqlite3`, `hashlib`, `gzip`, and networking modules plus
one pinned dependency: DuckDB. DuckDB reads the two Parquet inputs and streams
the joined result; do not load either complete dataset into Python memory.

Builder behavior:

1. Download `Meta.json`, `AllPrintings.parquet`, and
   `AllPricesToday.parquet` from MTGJSON's v5 file server.
2. Download and verify every accompanying `.sha256` before processing.
3. Require the price file to contain one distinct date and require that date
   to match `Meta.json`.
4. Filter price rows to:
   - `source = 'paper'`
   - `price_type = 'retail'`
   - one of the four supported providers
   - `finish IN ('normal', 'foil', 'etched')`
   - `currency IN ('USD', 'EUR')`
   - a finite price greater than zero
5. Join `prices.uuid` to `printings.uuid`, selecting
   `printings.identifiers.scryfallId` as `printing_id`.
6. Convert prices with decimal arithmetic and rounding to integer minor units;
   do not multiply a Python binary float by 100. DuckDB can cast to a DECIMAL
   before rounding.
7. Insert rows in stable `printing_id, provider, finish` order. Let the SQLite
   primary key make changed duplicate semantics a hard failure.
8. Count and report unmatched UUIDs. Skip them, but fail the build if fewer
   than 95% of eligible price rows map to a Scryfall ID. Do not add
   `AllIdentifiers` solely to chase the remaining v1 gap.
9. Reopen the finished database, run `PRAGMA quick_check`, verify the schema and
   metadata counts, then gzip it with deterministic metadata (`mtime = 0`).
10. Hash the compressed bytes and emit `latest.json` matching
    `MarketReleaseSchema`. Name the artifact
    `prices-v1-<observedOn>-<sha256>.sqlite.gz`.

The test must generate tiny Parquet fixtures and cover:

- UUID to Scryfall ID mapping.
- Paper/retail filtering.
- Rejection of MTGO and buylist rows.
- `normal` to `nonfoil`, plus foil and etched.
- Exact minor-unit conversion.
- Missing mappings and the coverage threshold.
- Duplicate quote rejection.
- Deterministic artifact output.

Acceptance criteria:

- The builder produces a valid, queryable SQLite gzip without retaining full
  source datasets in memory.
- Running it twice against identical fixtures produces identical compressed
  bytes.
- A real-data dry run reports source, mapped/unmapped, printing, quote,
  compressed-size, and checksum counts.

The planning-time dataset mapped roughly 97.5% of eligible paper-retail rows,
so the 95% floor catches a broken join while acknowledging the known unmapped
tail. Treat a material drop as a source-contract change, not as permission to
publish a partial snapshot.

## Phase 3: R2 publication and API delivery

Add a private R2 binding named `MARKET_DATA` in
`apps/api/wrangler.jsonc`. Keep `wrangler.jsonc` as the binding source of truth
and regenerate Worker types after changing it.
[Cloudflare Wrangler R2 configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#r2-buckets)

Likely files:

```text
apps/api/wrangler.jsonc
apps/api/src/market-release.ts
apps/api/src/index.ts
apps/api/src/worker-configuration.d.ts
apps/api/test/market-release.test.ts
.github/workflows/market-prices.yml
```

API behavior:

- `GET /market/release` reads `latest.json` from R2, parses it with
  `MarketReleaseSchema`, and returns `503 market_release_unavailable` if it is
  absent or invalid.
- `GET /market/files/:filename` accepts only the exact versioned filename
  pattern, reads `snapshots/:filename`, and streams the object body. Never call
  `arrayBuffer()` for the database artifact.
- Return `404` for an unknown object or malformed filename.
- Apply the object's HTTP metadata, return the R2 `httpEtag`, and use immutable
  caching for the versioned file. Do not set HTTP `Content-Encoding: gzip`;
  this is a gzip archive whose compressed bytes the client must hash.
- Add `/market/*` to `assets.run_worker_first`.
- Do not add a D1 table or a second Worker cron for prices.

R2 objects can be returned as a `ReadableStream`, and Cloudflare recommends the
quoted `httpEtag` value for response headers.
[Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

Publication workflow:

1. Trigger daily at 15:30 UTC and support `workflow_dispatch`.
2. Use a concurrency group so only one publication can run at a time.
3. Install the pinned Python requirement and run the builder tests.
4. Build the real snapshot.
5. Upload `snapshots/<versioned filename>` first with
   `Content-Type: application/gzip` and immutable cache metadata.
6. Upload `latest.json` last. This is the publication commit point.
7. Preserve the previous manifest and artifact if any prior step fails.

The workflow will require a narrowly scoped Cloudflare token and account ID in
GitHub secrets. Do not commit them and do not attempt to create or rotate them
without explicit authorization.

API tests must cover valid/missing/invalid manifests, exact file streaming,
ETag/cache headers, missing files, and path traversal attempts using the local
R2 test binding.

## Phase 4: Replaceable desktop market cache

Create a market module in the Electron main process:

```text
apps/desktop/electron/market.ts
apps/desktop/electron/market-store.ts
apps/desktop/electron/replaceable-file.ts
apps/desktop/test/market-store.test.ts
apps/desktop/test/replaceable-file.test.ts
```

Move the generic interrupted-replacement logic out of `catalog-files.ts` into
`replaceable-file.ts`, add one tested `replaceFileAtomically` helper, and use it
from both catalog and market code. Remove the obsolete catalog-specific helper
file rather than leaving duplicate paths.

Store the database at:

```text
app.getPath("userData")/market/prices.sqlite
```

Update behavior:

1. Deduplicate concurrent refreshes.
2. Fetch `/market/release` and compare `observedOn`, `schemaVersion`, and
   `sourceVersion` with the installed metadata.
3. If it is newer, stream the archive to a temporary file while counting bytes
   and hashing the compressed stream.
4. Require exact `compressedSize` and SHA-256 matches.
5. Gunzip to `prices.sqlite.part`; do not buffer the archive or database.
6. Open the partial database read-only, require `PRAGMA user_version = 1`, run
   `PRAGMA quick_check`, validate `market_meta`, and verify table counts against
   the release.
7. Atomically replace the installed database only after all checks pass.
8. Delete partial files on failure and retain the previously installed
   snapshot.
9. Publish a `market:changed` event after a successful swap.

Resolve both market routes from the existing `MOOLIGAN_API_URL`; do not add a
second service-origin setting.

Run an automatic check once after startup and every six hours while automatic
updates are enabled. A check is only a small manifest request; download the
artifact only when the snapshot changed. Failures update market status but do
not show a modal, block catalog use, or discard stale prices. Manual refresh
must work regardless of the automatic-update preference.

Expose only:

```text
market.status()
market.refresh()
market.quotes({ printingIds, provider })
market.onChanged(callback)
```

Validate the IPC sender and every argument. Require unique Scryfall UUIDs, cap
each request at 500 IDs, and validate the provider with the shared enum. Return
an empty result rather than an error when no market database is installed.
Open the SQLite database read-only for each short indexed query and close it
immediately; do not add a query worker until measurements show it is needed.

Desktop tests must prove:

- A valid archive installs and returns quotes.
- No installed database returns an empty batch and an uninstalled status.
- Hash, byte-count, gzip, schema, metadata, quick-check, and empty-snapshot
  failures never replace a valid database.
- Interrupted replacement recovers the previous database.
- An offline release check retains and serves the installed snapshot.
- Quote request validation rejects malformed or oversized input.

## Phase 5: Local market preferences

Extend the existing preferences rather than creating another settings store:

```ts
type Preferences = {
  motion: MotionPreference;
  marketProvider: MarketProvider;
  automaticPriceUpdates: boolean;
};
```

Tasks:

1. Add both definitions in `apps/desktop/electron/preferences.ts` with defaults
   `cardmarket` and `true`; mark them non-syncable.
2. Refactor local preference reads/writes and backups to handle every defined
   local key. Only a changed `motion` value should mark the existing remote
   sync state pending or trigger `PreferenceSyncCoordinator`.
3. Keep the remote preference API motion-only. Do not generalize cloud sync as
   part of this feature.
4. Update preference, workspace-store, backup, preload, and renderer type
   tests. Follow the repository rule of replacing obsolete backup contracts
   rather than adding compatibility fallbacks.
5. When automatic updates change from false to true, trigger a background
   market refresh. A provider change only invalidates renderer quote queries.

Acceptance criteria:

- Both settings survive restart and backup export/import.
- Neither setting is sent to the preference-sync API.
- Motion synchronization remains unchanged.

## Phase 6: Renderer integration

Likely files:

```text
apps/desktop/electron/main.ts
apps/desktop/electron/preload.ts
apps/desktop/src/electron.d.ts
apps/desktop/src/features/market/use-market.ts
apps/desktop/src/routes/search.tsx
apps/desktop/src/features/search/search-results.tsx
apps/desktop/src/routes/settings.tsx
apps/desktop/src/components/catalog-setup.tsx
```

Tasks:

1. Add React Query hooks for market status, refresh, and quote batches. Use
   `market:changed` to invalidate market queries; cached quotes can otherwise
   have infinite stale time because the local database is the source of truth.
2. In exact-printing search mode, request quotes for loaded card IDs and the
   selected provider. Split batches only when more than 500 cards are loaded.
3. Display all available finish quotes compactly. Use `Intl.NumberFormat` with
   the row's currency; do not add a money-formatting dependency.
4. Do not request or render prices when `uniqueCards` is true.
5. Treat a missing quote as unavailable, not zero and not an invitation to use
   another provider.
6. Add a Market section to Settings with provider selection, automatic-update
   toggle, manual refresh, last snapshot date, current update/error state, and
   provider/MTGJSON attribution.
7. Always show the snapshot date. Mark data older than 48 hours as stale but
   continue showing it offline.
8. Replace the catalog setup copy that currently implies prices are fetched
   on demand.

Do not add a renderer testing framework solely for this feature. Cover the
data and IPC behavior with existing Node tests, then manually smoke-test both
search layouts, settings, offline startup, stale data, and a failed refresh.

## Operational and legal gates

Before production publication:

1. Confirm that republishing transformed values from every enabled provider is
   permitted and record required attribution. MTGJSON is MIT-licensed but
   notes that incorporated third-party content may have separate terms.
   [MTGJSON license](https://www.mtgjson.com/license/)
2. Create the production R2 bucket and bind it as `MARKET_DATA`.
3. Add a least-privilege R2 write token and Cloudflare account ID as GitHub
   repository secrets.
4. Deploy the Worker binding, manually run the publication workflow, and verify
   `/market/release` plus one artifact download before relying on the schedule.

If redistribution is not permitted, stop before production upload and report
the blocker. Do not silently change the architecture to make desktop clients
download the full MTGJSON datasets.

## Definition of done

- Existing Scryfall catalog search and image behavior is unchanged.
- The scheduled builder publishes a validated, content-addressed daily price
  snapshot keyed by Scryfall printing ID.
- The desktop never downloads MTGJSON source datasets.
- A first price download is non-blocking and does not prompt the user.
- The previous snapshot remains queryable after restart, offline use, or any
  failed update.
- Exact-printing search results use only the selected provider and show
  finish, currency, provider, and snapshot freshness accurately.
- Unique-card mode shows no potentially misleading price.
- Market data is absent from workspace sync and backups; market preferences are
  present in backups but not cloud-synced.
- No D1 price rows, Worker ETL, provider abstraction, FX conversion, price
  history, or valuation feature was added.
- Documentation covers local R2 behavior, production bucket/secrets, manual
  publication, and the automatic update behavior.
- Run and pass:

```sh
vp check
vp run -r test
vp run -r build
python3 -m pip install -r tools/market/requirements.txt
python3 -m unittest tools/market/test_build_snapshot.py
```

Run a real-data builder dry run separately; ordinary CI must use tiny fixtures
and must not download MTGJSON's production datasets.
