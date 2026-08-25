# LiveStore refactor plan

Status: ready for implementation

Updated: 2026-08-25

## Goal

Replace the desktop workspace SQLite store with LiveStore while preserving the
complete account-free, offline product. Add optional Cloudflare synchronization
after the local application works end to end.

Each phase below is one reviewable pull request. Every PR must leave the
application buildable and usable. A PR must not depend on unfinished work from a
later PR.

This plan follows the product direction and domain language in
[`PROJECT.md`](../../PROJECT.md), and the existing catalog and spoiler decisions
in [`docs/adr`](../adr/).

## Fixed decisions

These choices are settled for this refactor:

- LiveStore runs in the Electron renderer through `@livestore/adapter-web` and
  persists to OPFS. This is LiveStore's documented Electron path.
- React reads and commits workspace state through `@livestore/react`.
- LiveStore is the only durable source of synchronized workspace state after a
  feature's cutover PR. There is no dual write, legacy read, or conversion path.
- Electron main still owns the card catalog, image protocols, local calendar
  date, protected authentication session, native file access, and the
  device-local workspace registry.
- Catalog filtering happens before card data reaches React. The renderer owns
  spoiler decisions, but it cannot supply a date or an `includeSpoilers` flag to
  a catalog query.
- The Scryfall catalog, downloaded images, derived catalog projections,
  authentication state, and device preferences never synchronize.
- One personal workspace maps to one LiveStore `storeId`.
- Sharing is read-only in its first version. Sharing is not implemented by this
  refactor, and no collaborative store model is added for it.
- If sign-in finds an existing account workspace, Mooligan opens that workspace
  and retains the previous unbound local workspace. It does not merge them.
- If sign-in finds no account workspace, Mooligan binds the active unbound local
  workspace to the account and begins synchronizing it.
- Signing out disables synchronization but keeps the current workspace and its
  local data available.
- Deck and card-list storage are not moved to LiveStore in this refactor because
  their routes are placeholders. The unused persistence is deleted. Their event
  models will be designed with their actual product flows.
- Development databases and backup formats 1 and 2 are not migrated. The project
  has not shipped, so obsolete formats are removed instead of preserved.

LiveStore 0.4.0 is the stable documentation version at the time of this plan.
Before PR 1 starts, recheck the current stable release and pin every LiveStore
package to the same exact version in `pnpm-workspace.yaml`.

Relevant LiveStore references:

- [Electron adapter](https://docs.livestore.dev/platform-adapters/electron-adapter/)
- [Web adapter](https://docs.livestore.dev/platform-adapters/web-adapter/)
- [React integration](https://docs.livestore.dev/framework-integrations/react/)
- [Cloudflare sync provider](https://docs.livestore.dev/sync-providers/cloudflare/)
- [Authentication pattern](https://docs.livestore.dev/patterns/auth/)

## Target ownership

| Data                           | Durable owner                    | Process         | Synchronized | Backed up |
| ------------------------------ | -------------------------------- | --------------- | ------------ | --------- |
| Collection lots                | LiveStore synced events          | Renderer worker | Yes          | Yes       |
| Spoiler policy and decisions   | LiveStore synced events          | Renderer worker | Yes          | Yes       |
| Motion preference              | Browser local storage            | Renderer        | No           | No        |
| Active workspace and device ID | Workspace registry SQLite        | Electron main   | No           | No        |
| Better Auth session            | Protected authentication storage | Electron main   | No           | No        |
| Card catalog and set metadata  | Catalog SQLite                   | Catalog worker  | No           | No        |
| Collection catalog projection  | Temporary SQLite tables          | Catalog worker  | No           | No        |
| Card images and set symbols    | Device cache                     | Electron main   | No           | No        |

## Target process boundary

```text
Renderer
├── LiveStoreProvider
├── LiveStore web adapter
├── workspace event commits and reactive queries
└── workspace projection bridge
        │
        │ validated spoiler state and collection-lot changes
        ▼
Electron main
├── protected authentication session
├── workspace and device registry
├── backup file access
├── catalog IPC
└── catalog query worker
        ├── temporary collection-lot projection
        └── read-only Scryfall catalog SQLite

Renderer LiveStore worker ◀──── optional sync ────▶ Cloudflare Durable Object
```

The projection inside the catalog worker is disposable. LiveStore rebuilds it
after startup, renderer reload, workspace switch, or catalog-worker restart. It
is never exported or treated as a second source of truth.

## Rules for every PR

Every implementation PR must meet these rules:

1. Keep the account-free application usable offline.
2. Use one authoritative write path for every datum changed by the PR.
3. Delete the replaced write path in the same PR that cuts over its callers.
4. Validate IPC input on both sides of the preload boundary.
5. Keep protected catalog data out of ordinary renderer results.
6. Add the smallest test that proves each new failure or concurrency rule.
7. Do not add deck, list, mobile, presence, sharing, or generic repository
   abstractions for future work.
8. Pin LiveStore packages to one exact version. Upgrade them in a dedicated PR.
9. Run the repository checks before requesting review:

   ```sh
   vp check
   vp run -r test
   vp run -r build
   ```

10. Run `vp run desktop#package` for PRs that change Electron startup, workers,
    preload, OPFS, CSP, or packaging.

Each PR description must include:

- The source of truth before and after the PR.
- Any development data or backup format that stops working.
- Automated checks run by the author.
- Manual scenarios run in the packaged desktop app.
- Screenshots only when a visible UI changes.

## PR sequence

| PR  | Outcome                                                  | Depends on |
| --- | -------------------------------------------------------- | ---------- |
| 1   | Renderer LiveStore runtime works in packaged Electron    | None       |
| 2   | Spoiler policy and decisions use LiveStore               | PR 1       |
| 3   | Collection lots use LiveStore and catalog projection     | PR 2       |
| 4   | Legacy workspace storage is deleted and backup v3 works  | PR 3       |
| 5   | Cloudflare stores and authorizes synchronized event logs | PR 4       |
| 6   | Desktop sign-in enables optional synchronization         | PR 5       |
| 7   | Failure, scale, and release gates are complete           | PR 6       |

The sequence is linear because each PR removes code that the next PR assumes is
gone. Do not open parallel implementation PRs against the same persistence
files.

## PR 1: Establish the renderer LiveStore runtime

### Review outcome

The packaged Electron app opens one persistent LiveStore for the active
workspace through the web adapter. Existing SQL-backed product features remain
unchanged. This PR proves the platform choice before any user data moves.

### Domain and decision records

Update the domain language in `PROJECT.md` with these product terms:

- **Workspace**: the boundary containing one personal collection and its durable
  user decisions. A workspace exists without an account and may later bind to
  one account.
- **Device**: one Mooligan installation with its own local files, caches, and
  stable synchronization client identity.
- **Account**: an optional service identity used to synchronize a personal
  workspace and publish shared content.
- **Unbound workspace**: a workspace that has no account association.
- **Shared artifact**: a read-only deck or list published by its owner. Opening
  it does not add it to the recipient's personal workspace.

Add ADR 0007 for the hard-to-reverse process and storage choice:

- LiveStore web adapter in the renderer.
- OPFS local persistence.
- Catalog and auth remain in Electron main.
- A validated projection bridge supplies only the workspace state needed by
  catalog reads.
- The Node adapter was rejected because LiveStore documents the web adapter as
  its Electron path and does not yet provide dedicated Electron main-process
  coordination.

Do not rewrite ADR 0003 or ADR 0006 yet. Their implementation still exists when
PR 1 merges.

### Package and schema foundation

Create `packages/workspace` as `@mooligan/workspace` with:

- LiveStore event, table, materializer, query, and sync-payload schemas.
- Effect Schema limited to LiveStore's schema boundary.
- Zod retained in `@mooligan/domain` and existing IPC contracts.
- Versioned event names from the first event.
- Pure schema exports usable by the renderer worker and later Cloudflare code.
- Node tests for deterministic materializer replay.

Start with only the tables and events required by PR 2. Do not add deck or list
tables. Collection events may be designed in PR 3 so their concurrency tests
land beside them.

### Workspace bootstrap

Extract the device-local registry responsibilities from `WorkspaceStore` into a
small `WorkspaceRegistry` owned by Electron main. The registry stores:

- A stable random device or LiveStore client ID.
- Every known workspace ID.
- The active workspace ID.
- An optional account ID binding for each workspace.

Keep SQLite for this registry. It must exist before the renderer knows which
LiveStore to open, and it is device infrastructure rather than synchronized
workspace data.

Expose one narrow preload operation such as `workspace.bootstrap`. It returns a
validated object containing the active `workspaceId` and stable `clientId`. It
must not return filesystem paths, auth cookies, or catalog paths.

### Renderer runtime

Add:

- A LiveStore worker initialized with the shared workspace schema.
- The web adapter shared worker.
- A root `LiveStoreProvider` keyed by the active workspace ID.
- Explicit loading and failure states before the router mounts workspace-backed
  screens.
- Store disposal during workspace replacement and application shutdown.
- Development-only LiveStore devtools if they do not weaken production CSP or
  enter the production bundle.

Update the Vite and Electron build so worker assets load from the packaged
application. Add only the CSP directives required by those workers and the
configured sync endpoint. Do not add broad `*`, `blob:` or remote script
allowances without a test proving they are required.

No existing UI reads from or writes to LiveStore in this PR. Opening the store
is the compatibility test. Do not mirror SQL data into it.

### Automated verification

Add tests for:

- Workspace bootstrap validation.
- Stable `clientId` across main-process restarts.
- A new workspace receiving a different `storeId`.
- Shared schema importing in both renderer and worker builds.
- LiveStore event replay producing the same materialized state twice.
- Production CSP containing the minimum worker and sync permissions.

### Packaged-app review checklist

Manually verify:

1. Launch with no account and no network.
2. Close and reopen the packaged application.
3. Reload the renderer and confirm the same store reconnects.
4. Confirm OPFS data survives a full application restart.
5. Confirm worker chunks load from the packaged application without console
   errors.
6. Confirm the existing collection, spoiler controls, backup, and catalog still
   behave exactly as before.

### Exit criteria

- The packaged app passes the checklist on macOS.
- CI builds the web worker and shared worker.
- Existing product state still has one SQL source of truth.
- No LiveStore compatibility shim or Node-adapter fallback exists.

If this PR cannot satisfy the packaged-app checklist, stop the refactor. Evaluate
the Node adapter in a replacement PR rather than adding both adapters.

## PR 2: Move spoiler state to LiveStore

### Review outcome

Spoiler policy, reveal decisions, protection tombstones, and reset generation
use synchronized LiveStore events. Electron main still filters every catalog
and image read before returning protected data.

### Event model

Add versioned synced events equivalent to:

- `v1.SpoilerPolicyChanged`
- `v1.SpoilerDecisionChanged`
- `v1.SpoilerProtectionReset`

The materialized state must retain:

- The current `protect` or `show` policy.
- A reset generation.
- One explicit reveal or protect decision per scope and target.
- Enough causal identity to distinguish a sequential decision from a stale or
  concurrent decision.

Encode these outcomes in table-driven materializer tests before connecting the
UI:

1. A later causally observed decision replaces the earlier decision.
2. Concurrent reveal and protect decisions resolve to protect.
3. Re-protection remains an explicit tombstone.
4. A reset invalidates reveals made against an older generation.
5. A stale offline reveal cannot undo a later reset.
6. Replaying the same globally ordered events produces identical state.

Do not use wall-clock timestamps to decide conflicts. Local clocks can disagree.

### Renderer cutover

Replace `use-spoilers.ts` and the spoiler portion of `use-preferences.ts` with
LiveStore reactive queries and event commits. The UI should keep its current
domain actions:

- Set policy.
- Reveal or protect one printing.
- Reveal or protect one release family.
- Protect all previews.

Keep catalog-derived release-family resolution in the trusted catalog path.
Renderer actions send stable printing or set IDs, not precomputed family trees.

### Spoiler projection bridge

Add a narrow preload namespace for workspace projections. The bridge has a
session identifier tied to the current renderer and workspace, plus a monotonic
projection revision.

On initial connection:

1. Electron main marks the spoiler projection unready and protects every
   preview.
2. The renderer sends a complete validated spoiler snapshot.
3. Main combines that snapshot with its own local date.
4. Main acknowledges the applied revision.
5. Catalog queries become ready and React Query invalidates catalog results.

After bootstrap, send ordered spoiler deltas. If main sees a revision gap, a
workspace mismatch, a renderer replacement, or invalid data, it returns to full
protection and asks for a complete snapshot.

Main must continue to own:

- The current local date and midnight rollover.
- Effective printing visibility.
- Catalog query filtering and result redaction.
- Image-source authorization.
- Catalog and image authorization epochs.

No catalog IPC request may accept the spoiler snapshot itself. Catalog calls use
only the last accepted main-process projection.

### Backup during the staged cutover

Move backup orchestration to the renderer because it will become the owner of
workspace state. Electron main remains responsible for bounded file reads,
validation at the native boundary, save dialogs, and atomic file writes.

For this PR only, the renderer combines:

- LiveStore spoiler state.
- A validated read-only snapshot of the still-SQL collection and legacy
  placeholder entities supplied by main.

This bridge is not a second write path. Delete the SQL snapshot operation in PR
4 after all durable workspace state has moved.

Import remains restore-as-new and must not partially replace the active
workspace. For backup version 2 during this staged PR:

1. Main reads and validates the selected file.
2. Main creates an inactive workspace and imports the still-SQL collection,
   motion preference, decks, and card lists into it.
3. The renderer opens a LiveStore for that workspace and commits the imported
   spoiler policy and decisions as normal events.
4. Both owners read back their state for verification.
5. Main activates the new workspace only after both sides succeed.

Failure leaves the previous workspace active. This restore coordinator remains
useful through the staged cutover and becomes LiveStore-only in PR 4.

### Delete replaced code

In the same PR:

- Delete SQL writes for spoiler policy and decisions.
- Delete the spoiler tables from new development workspace schemas.
- Remove the spoiler mutation methods from `WorkspaceStore`.
- Remove `spoilers:*` mutation and subscription IPC channels that LiveStore
  replaces.
- Keep only catalog operations that need the accepted spoiler projection.
- Update ADR 0003 so it states the product invariant rather than claiming that
  main owns the durable spoiler state.

### Verification

Automated tests must cover:

- Every conflict and reset scenario above.
- Default protection before LiveStore finishes opening.
- Rejection of stale and wrong-workspace projections.
- Renderer reload returning to full protection until resync.
- Midnight visibility change without a renderer-supplied date.
- Search, details, siblings, upcoming results, collection rows, and image
  protocol authorization.
- Backup export containing LiveStore spoiler state.

Manual review must cover offline restart, reveal and re-protect actions, protect
all, renderer reload, and packaged image behavior.

### Exit criteria

- LiveStore is the only durable spoiler source.
- Protected card characteristics never cross the catalog boundary during normal
  product use.
- The old spoiler SQL and mutation IPC are gone.
- The app remains useful offline without an account.

## PR 3: Move collection lots to LiveStore

### Review outcome

Collection mutations commit LiveStore events in the renderer. The catalog worker
joins the catalog against a disposable collection-lot projection instead of
attaching the workspace database.

### Event and state model

Add a `collection_lots` LiveStore table with the fields already defined by the
domain model:

- Stable lot ID.
- Printing ID.
- Finish, card language, and card condition.
- Positive quantity.
- Optional acquisition time, unit cost, storage location, and notes.

Use intent-based, versioned events equivalent to:

- `v1.CollectionCopiesAdded`
- `v1.CollectionLotChanged`
- `v1.CollectionLotRemoved`

Do not store raw SQL, UI forms, catalog JSON, or precomputed Holdings in events.
Holdings remain a read model grouped by printing, finish, language, and
condition.

Before connecting the UI, encode these scenarios in materializer tests:

1. Two offline additions to the same Holding are additive.
2. Replaying a synchronized order yields the same lot and Holding quantities on
   both clients.
3. An update that changes a Holding key merges with an existing unattributed
   Holding without losing quantity.
4. A removal followed by a stale offline edit does not resurrect the removed
   lot.
5. Two absolute edits resolve deterministically in synchronized order.
6. Invalid quantity, finish, language, condition, or paired unit-cost data never
   enters materialized state.
7. Missing catalog records retain ownership data.

The PR may adjust event payloads to satisfy those outcomes. Keep the model to
the three user intents above unless a failing scenario proves another event is
needed.

### Renderer mutations

Replace collection add, update, and remove IPC calls with LiveStore commits.
Keep catalog validation before committing an add or finish change:

- The renderer asks the existing narrow catalog API for allowed printing facts.
- Main validates the printing, paper status, spoiler visibility, and finishes.
- The renderer commits an event only after validation succeeds.
- The materializer repeats domain constraints that do not depend on the
  catalog.

This validation protects product correctness. It is not a security boundary
against a modified local application.

Replace collection mutation cache events with LiveStore reactivity. Keep React
Query for collection pages because their card enrichment, spoiler filtering,
totals, sorting, and pagination still belong to the catalog worker.

### Catalog projection

Replace the workspace database attachment in
`electron/catalog/query-worker.ts` with temporary `collection_lots` tables.

The renderer bridge sends:

- One complete collection snapshot after the store opens.
- Ordered lot upserts and deletions after each accepted LiveStore change.
- A complete replacement after a revision gap, worker restart, renderer reload,
  or workspace switch.

The main process validates workspace ID, projection session, revision, lot
schema, and batch limits. The catalog worker applies each accepted batch in one
transaction and acknowledges its revision.

While the projection is unready, `collection:list` returns a typed not-ready
result. It must not return rows from the previous workspace. Catalog search and
card detail remain available because they do not require collection projection
state.

Change the current collection SQL only where it references
`workspace.collection_lots`. Preserve the existing aggregation, left catalog
join, filtering, sorting, totals, pagination, unavailable-printing handling, and
spoiler redaction.

Start with a keyed in-memory diff of LiveStore query results in the renderer.
Do not add an outbox or generic replication framework. Measure it against the
existing 100,000-lot backup limit. Add a more incremental source only if that
measurement fails.

### Delete replaced code

In the same PR:

- Delete collection writes from `WorkspaceStore`.
- Delete the workspace collection mutation queue if nothing still uses it.
- Delete collection mutation IPC and renderer cache subscriptions.
- Delete the SQL `collection_lots` table from newly created legacy databases.
- Delete the query worker's workspace path and `ATTACH` handling.
- Supersede ADR 0006 with the temporary-projection decision.

Do not delete the remaining registry, preferences, backup, deck, or list code
until PR 4.

### Backup during the staged cutover

Update the PR 2 backup coordinator so the renderer now supplies both LiveStore
spoiler state and collection lots. Main supplies only the still-SQL motion
preference, decks, and card lists.

During import, commit collection and spoiler events into the inactive
workspace's LiveStore before activation. Main imports only the remaining SQL
sections. Verify both owners before switching the active workspace. Export and
restore must keep working throughout this PR.

### Verification

Automated tests must cover:

- Every event scenario above.
- Add, edit, merge, and remove through the renderer store.
- Initial projection and ordered delta application.
- Revision gap recovery with a full replacement.
- Worker restart and workspace switch without stale results.
- Current collection filters, sorts, totals, and pagination.
- Protected and unavailable Holdings.
- A 100,000-lot projection and one-lot mutation benchmark.

Manual review must cover two renderer reloads, catalog replacement, collection
edits while offline, and a packaged restart with a large fixture.

### Exit criteria

- LiveStore is the only durable collection-lot source.
- The catalog worker never opens a LiveStore persistence file.
- No collection mutation crosses IPC.
- Current collection behavior and spoiler behavior remain intact.

## PR 4: Finish local cutover and replace backup

### Review outcome

The old workspace database and its backup formats are gone. Backup version 3
exports LiveStore workspace data and restores it into a new unbound workspace.

### Device preference

Move the motion preference to renderer local storage and a reactive hook. Reuse
the existing search-view preference pattern instead of adding another storage
abstraction. Motion remains on the current device and does not enter sync or
workspace backups.

Remove the generic preferences IPC namespace and SQL preference table. Spoiler
policy already belongs to the LiveStore spoiler model and must not remain in a
generic preference object.

### Backup version 3

Define the backup schema in `@mooligan/workspace`. It contains only:

- Format name and version 3.
- Collection lots.
- Spoiler policy, reset generation, and explicit decisions.

It excludes:

- Event-log internals and sequence numbers.
- Account, session, and sync credentials.
- Device and client IDs.
- Motion preference.
- Catalog and cache data.
- Placeholder decks and card lists.

Keep the existing 50 MiB file limit and 100,000-item limits unless tests show
that the serialized version 3 shape needs a smaller safe limit.

### Restore workflow

Import follows this order:

1. Main reads at most the configured byte limit and parses strict JSON.
2. The renderer validates version 3 with the shared backup schema.
3. Main creates a new unbound workspace registry entry without activating it.
4. The renderer opens the new LiveStore.
5. The renderer commits normal versioned events in bounded batches.
6. The renderer reads back and compares the materialized snapshot.
7. Main atomically marks the new workspace active.
8. The application reloads against the new `storeId`.

Any failure before step 7 leaves the previous active workspace untouched. Main
removes the failed registry entry after the new store closes. Do not inject rows
into LiveStore SQLite or commit one giant snapshot event.

Restoring a backup always creates an unbound local workspace. It never replaces
or silently publishes into an account workspace.

### Delete legacy storage

Delete:

- `WorkspaceStore` and its user-data database.
- The old workspace database schema and SQL repositories.
- Backup parsers for versions 1 and 2.
- Legacy deck and card-list persistence methods and tables.
- The temporary SQL snapshot operation introduced for staged backup export.
- Tests that assert obsolete schemas or compatibility behavior.

Keep only the small workspace registry in Electron main.

The PR description must state these intentional development regressions:

- Existing workspace SQLite data is not imported.
- Backup versions 1 and 2 are rejected.
- Placeholder deck and card-list records in old development backups are
  discarded.

### Verification

Automated tests must cover:

- Strict version 3 parsing and size limits.
- Exclusion of credentials, catalog data, device IDs, and motion preference.
- A round trip with 100,000 lots and 100,000 spoiler decisions.
- Restore failure before activation preserving the old workspace.
- Successful restore switching only after snapshot verification.
- Wrong versions and unknown fields being rejected.
- No references to `WorkspaceStore`, old backup versions, `decks`, or
  `card_lists` persistence remaining in desktop source.

Manual review must export, inspect, and restore a backup in the packaged app.

### Exit criteria

- No user-owned mutable workspace data remains in main-process SQLite.
- Backup version 3 is the only accepted format.
- Restoring cannot partially overwrite the active workspace.
- The application still starts offline without an account.

## PR 5: Add the authorized Cloudflare sync service

### Review outcome

The Cloudflare API can create an account's personal workspace, issue a
short-lived workspace credential, and synchronize an authorized LiveStore event
log. Desktop does not enable sync until PR 6.

### Cloudflare storage

Add the exact-version `@livestore/sync-cf` server package. Configure:

- One Durable Object class for LiveStore synchronization.
- Durable Object SQLite as the event-log storage engine.
- Explicit Wrangler bindings and migrations.
- Existing D1 for account-to-workspace ownership, not for LiveStore events.

Add a D1 table with one personal workspace per account. At minimum it records a
stable workspace ID, Better Auth user ID, and creation time. Enforce ownership
with a database constraint rather than relying only on application checks.

Do not add sharing tables in this PR.

### Workspace API

Add authenticated endpoints for:

- Reading or creating the signed-in account's personal workspace.
- Binding an unbound workspace when the account has no existing workspace.
- Issuing a short-lived sync credential for the account's workspace.

Binding must fail if:

- The account already owns another workspace.
- The requested workspace belongs to another account.
- The workspace ID is malformed.

The sync credential should contain only the user ID, workspace ID, audience,
issued-at time, expiry, and a token identifier if replay tracking becomes
necessary. Sign it with a dedicated sync secret. Do not reuse the Better Auth
session token or signing material.

Start with a five-minute credential lifetime. This is an internal operational
value and can change without changing the domain model.

### Sync authorization

Validate the typed LiveStore `syncPayload` when the connection opens. Also make
workspace ownership available to push and pull callbacks so a hibernated or
long-lived connection cannot outlive revoked access unnoticed.

Authorization must bind all three values:

- Authenticated account ID.
- Requested LiveStore `storeId`.
- Workspace ID in the signed credential.

Reject a request if any value differs. Never authorize solely because the
caller knows a workspace UUID.

Configure backend reset and storage identifiers explicitly. Do not rely on
package defaults for a path that can erase or replace a client's event history.

### Verification

Use the Cloudflare Vitest pool and local Wrangler storage to test:

- Account workspace creation is idempotent.
- Binding an unbound workspace succeeds once.
- A second workspace binding is rejected.
- Cross-account pull and push are rejected.
- A token for one workspace cannot open another store ID.
- Expired, malformed, wrong-audience, and wrongly signed credentials fail.
- Authorized push followed by pull returns the same events.
- Durable Object restart preserves the event log.
- The API and auth routes continue to work when the sync binding is unavailable.

### Exit criteria

- The server stores no catalog or backup data.
- D1 owns account-workspace relationships.
- The Durable Object owns synchronized event logs.
- Every sync connection is workspace-authorized.
- The desktop app remains entirely local because it has not enabled the client
  backend yet.

## PR 6: Connect desktop accounts to optional sync

### Review outcome

Signing in enables synchronization for the account workspace. Signing out or
losing the service leaves the current local workspace editable.

### Credential boundary

Keep the Better Auth cookie jar and protected session in Electron main. Main
calls the workspace API and exposes only these renderer values:

- The account workspace ID.
- A short-lived workspace-scoped sync credential.
- Its expiry time.

The renderer keeps that credential in memory and passes it through LiveStore's
typed `syncPayload`. It never writes the credential to OPFS, local storage, a
backup, logs, or error telemetry.

Refresh the credential before expiry. If the installed LiveStore version cannot
replace `syncPayload` on an open connection, close and reopen the same local
store with the new credential. Prove that unsynchronized local events survive
that cycle before merging the PR.

### Account lifecycle

Implement these scenarios:

#### Sign in with no remote workspace

1. Keep the active unbound workspace open.
2. Ask the API to bind its ID to the account.
3. Reopen the same store with sync enabled.
4. Push existing local events.

#### Sign in with an existing remote workspace

1. Keep the previous local workspace in the device registry as unbound.
2. Add or locate the account workspace entry.
3. Switch the renderer to the account's `storeId`.
4. Pull remote events into that workspace.
5. Do not merge, delete, or upload the previous local workspace.

#### Sign out

1. Stop refreshing credentials.
2. Reopen the current store without a sync backend if required by LiveStore.
3. Keep all local materialized state and pending local events.
4. Keep the workspace available for offline editing.

#### Switch accounts

1. Never reuse the previous account's credential.
2. Switch to the new account's workspace ID.
3. Clear main's accepted spoiler and collection projections during the switch.
4. Require a complete projection before collection catalog reads resume.

Add a small Settings workspace selector so retained unbound workspaces are
actually recoverable. It should show a local label and account association, not
raw sync credentials or filesystem paths.

### Sync configuration

Use the LiveStore Cloudflare web client in the renderer worker. Configure:

- The API's production and local development sync URLs.
- Typed sync payload validation.
- Bounded reconnect and clear error reporting.
- `onBackendIdMismatch: "shutdown"` or the equivalent non-destructive option.

Do not accept LiveStore's reset behavior if it can clear local persistence after
a backend reset. Mooligan is local-first, so a server reset must stop sync and
preserve local data for recovery.

The UI may show local, connecting, synchronized, or sync-paused status. A sync
error must not disable collection or spoiler mutations.

### Two-client verification

Automated integration tests and a packaged manual test must cover:

1. Desktop A creates local data before sign-in, binds, and uploads it.
2. Desktop B signs into the same account and receives it.
3. Both go offline and add copies to the same Holding.
4. Both reconnect and converge on the additive quantity.
5. One device reveals a preview while the other protects it concurrently.
6. Both converge on protection.
7. One device uses Protect all while the other remains offline with stale
   reveals.
8. The stale device reconnects without restoring those reveals.
9. An expired credential pauses sync while local edits continue.
10. Sign-out, restart, and offline startup preserve the current local data.
11. Signing into an account with an existing workspace retains the prior local
    workspace without merging it.

### Exit criteria

- Accounts remain optional.
- Sync credentials never enter durable renderer storage.
- Local reads and writes continue during API, auth, or sync failure.
- Two clients converge for the required collection and spoiler scenarios.
- Cross-account workspace switching does not leak stale catalog projections.

## PR 7: Complete release hardening

### Review outcome

The LiveStore version is ready for normal development use and has explicit
failure behavior for packaging, scale, backend reset, version skew, and damaged
local state.

### Failure behavior

Add tests or documented packaged-app drills for:

- Renderer crash during a local commit.
- Application quit during projection update.
- Catalog worker crash and rebuild.
- Network loss during push and pull.
- Sync token expiry during an open connection.
- Durable Object restart.
- Sync backend identifier mismatch.
- Invalid remote event payload.
- OPFS open failure and quota exhaustion.
- Backup restore interruption before activation.

Each failure must preserve the last confirmed local event log. The application
may pause sync or require a restart, but it must not silently clear local data.

### Scale checks

Record repeatable measurements for:

- Cold store open with 100,000 collection lots.
- Initial catalog projection of 100,000 lots.
- One-lot mutation after the large projection.
- Backup export and restore at the configured limits.
- Initial remote pull of a large event log.
- Event-log growth under repeated quantity edits.

Use the results to set regression thresholds in tests where the environment is
stable. Do not add compaction, snapshots, or custom indexing unless a measured
failure requires them. LiveStore does not currently provide every event-log
maintenance feature, so document the measured ceiling before public sync ships.

### Client version policy

Version event names from the start and include the desktop app version when
requesting a sync credential. Before public sync ships, the API must be able to
reject clients older than the minimum event schema version with a clear upgrade
message. This prevents an old client from receiving an event it cannot decode.

Do not build a general migration service. Add only the minimum version check
needed by the schemas that exist at this point.

### Documentation and cleanup

Update:

- `README.md` with local LiveStore storage, reset, and sync development steps.
- `PROJECT.md` only if the shipped behavior changes its product direction.
- ADR 0007 from PR 1 with any implementation facts that changed during the
  refactor.
- ADR 0003 and ADR 0006 status and wording so they match the final boundaries.
- `docs/collection-v1.md` where it still describes SQL attachment or main-owned
  mutations.

Search the repository for obsolete names and paths:

```sh
rg -n "WorkspaceStore|workspace\.collection_lots|ATTACH DATABASE|spoilers:read|collection:add|backup.*version.*[12]" .
```

Every remaining match must be current documentation, a deliberate test fixture,
or removed.

### Final validation

Run:

```sh
vp install
vp check
vp run -r test
vp run -r build
vp run desktop#package
```

Then run the complete two-client scenario against local Wrangler and one staging
deployment.

### Exit criteria

- All mutable workspace features have one LiveStore source of truth.
- Account-free offline use passes from a clean install.
- Optional synchronization converges after offline edits.
- Protected catalog data remains filtered before normal React views receive it.
- A backend reset cannot trigger automatic deletion of local workspace data.
- Backup version 3 restores into a new unbound workspace.
- Old SQL workspace storage, mutation IPC, and backup compatibility code are
  absent.
- The packaged app passes the worker, OPFS, restart, and sync tests.

## Deferred work

The refactor intentionally leaves these items out:

- Deck and card-list event schemas.
- Read-only sharing endpoints and public views.
- Collaborative editing.
- Mobile application code.
- Presence and cursor state.
- Event-log compaction not justified by measurements.
- Automatic merging between unrelated local and account workspaces.
- Import of development-era workspace databases or backup versions 1 and 2.

Add each item only when its product workflow is ready to implement.
