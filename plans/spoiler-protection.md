# Spoiler Protection

Status: implemented (phases 1–5; Phase 6 remains deferred)

## Objective

Protect users from unreleased card information by default while letting them
durably reveal one exact printing, an entire release family, or all previews.
Apply the policy at the local catalog boundary so search, direct routes,
artwork, and derived product surfaces cannot accidentally bypass it.

See [ADR 0003](../docs/adr/0003-spoiler-protection-at-the-catalog-boundary.md).

## Product constraints

- Protection must work locally without an account or network connection.
- A new workspace protects previews without asking an onboarding question.
- Catalog replacement must not erase user reveal decisions.
- A reveal must use the narrowest scope the user selected and remain reversible.
- Ordinary search must disclose nothing about protected matches.
- Future collections, decks, lists, exports, and shares must preserve user data
  without exposing protected card characteristics.
- Synchronization enhances the complete local workflow; it is not required for
  protection or reveal actions.

## Accepted behavior

### Printing-level classification

A preview printing has an effective release date later than the user's local
date. Use the printing's date first and its set's date as a fallback. Status is
computed rather than stored. Protection ends automatically at local midnight
on release day.

An unreleased reprint is protected independently. Its card identity and older
released printings remain usable. When search requests one result per card, it
chooses the newest visible printing rather than the newest printing overall.

### Durable reveal scopes

The workspace stores:

- A global policy: `protect` by default or `show` for “Always show previews.”
- Exact printing decisions keyed by stable printing ID.
- Release-family decisions keyed by the stable root set ID.
- A reset generation that invalidates older reveals after “Protect all
  previews.”

“Reveal this printing” affects only the selected printing. It does not reveal
other treatments with the same Oracle identity. “Reveal this release” resolves
from any subset to the root set and covers every current and future descendant.

Turning off “Always show previews” restores existing narrower reveals. The
separate “Protect all previews” action clears their effective consent by
advancing the reset generation.

### Protected search

Protected printings are absent from the ordinary Card index browse, text
search, totals, pagination, and unique-card representative selection. Card
index search does not show protected placeholders, names, hidden-match counts,
or query-sensitive notices.

The search page has a separate Upcoming tab that intentionally lists every
future printing, independent of the Card index query and filters. A protected
item contains only its printing ID, root release-family summary, and effective
release date across the catalog boundary. It renders as “Protected preview”
with release name, code/symbol, and date; it does not expose card name, art,
collector number, type, rarity, or price. Selecting it opens the direct gate,
where the user can reveal that exact printing. Visible upcoming printings render
as ordinary card results.

### Direct links and artwork

A direct route to a protected printing renders a gate that exposes only:

- “Protected preview.”
- The root release-family name.
- Set code and locally served set symbol.
- The selected printing's release date.
- “Reveal this printing” as the primary action.
- “Reveal this release” as the secondary action.

The route does not load the card name, artwork, faces, Oracle text, price, or
printing details before reveal. The image protocol refuses protected printing
requests whether or not a matching file is already cached.

The gate itself is sufficient confirmation. Revealing is immediate and does
not open a second dialog or require a hold gesture.

### Upcoming releases

The Sets page includes an Upcoming section containing one item per root release
family. Before reveal, an item shows only its name, code, set symbol, and release
date. For a family with staggered products, use its next future printing date.
It shows no card count, preview count, art, mechanics, colors, or progress.

The section is the intentional route into previews. Revealing from any family
member reveals the complete family.

### Re-protection

Visible preview details provide “Protect this printing” when their visibility
comes from a printing reveal. Release surfaces provide “Protect this release.”
If a broader decision currently exposes the content, the narrower control
explains that the broader setting must be disabled first.

Settings provides:

- Spoiler protection status.
- “Always show previews.”
- Active printing and release reveals with removal actions.
- “Protect all previews.”

These actions change visibility only and never delete catalog or workspace
data.

### User-owned rows, exports, and sharing

A collection lot, deck entry, or list entry for a protected preview remains in
storage. Only its row is gated. The row may display quantity and “Protected
preview”; every card characteristic and derived analytic contribution remains
concealed.

Exports retain exact identifiers and warn generically that protected previews
are present. Sharing never changes reveal state. A recipient evaluates the
artifact through their own workspace policy.

## Domain model

```text
Catalog database                         Workspace database

Set ──0..1──> parent Set                 Spoiler policy: protect | show
 │                                         Reset generation
 └──> root release family ID               │
                                           ├── Printing reveal ──> Printing ID
Printing ──> Set                            └── Release reveal ───> Root set ID
    │
    └── effective release date

Effective visibility = released
                    OR policy is show
                    OR root release family is revealed
                    OR exact printing is revealed
```

The workspace never copies mutable card names, dates, or family membership.
Those remain catalog facts. The catalog never owns consent.

## Read contracts

Introduce renderer-safe contracts in the shared domain package:

```text
CatalogPrintingResult
  visible   -> complete CatalogCardDetail
  protected -> printing ID + root release summary only

CatalogReleaseSummary
  root set ID + name + code + symbol descriptor + next future release date

SpoilerState
  policy + active printing IDs + active root set IDs + revision
```

The protected result must be a separate discriminated-union member so full card
fields cannot accidentally be populated. Image and set-symbol descriptors
identify trusted catalog resources; they never expose arbitrary remote URLs to
the renderer.

## Implementation plan

Each phase leaves Mooligan working. The first local end-to-end protection loop
lands before Settings polish or synchronization.

### Phase 1: Import set metadata and resolve release families

1. Add strict Scryfall set and set-list schemas for the fields Mooligan needs:
   stable set ID, code, name, type, release date, parent set code, card count,
   digital status, and symbol URI.
2. During catalog download, request Scryfall's `/sets` endpoint once with the
   required descriptive `User-Agent` and `Accept` headers. Continue using bulk
   data for card records; do not make per-card or per-set API requests.
3. Stream card data as today, validate the set response, and build both into the
   same partial SQLite catalog before atomic replacement. A failed set fetch or
   invalid family graph leaves the installed catalog untouched.
4. Add a `sets` table keyed by stable set ID with unique code, optional parent
   code, resolved root family ID, release date, type, and symbol source.
5. Import each card's stable set ID and require it to resolve to an imported set.
   Resolve parent chains transitively, reject cycles, and verify every declared
   parent exists before completing the catalog.
6. Bump the pre-release catalog schema version and update integrity validation.
   Rebuild fresh catalogs; do not add a compatibility path for older schemas.
7. Add domain tests for set parsing and catalog tests for root, child,
   grandchild, missing-parent, cycle, and card-with-missing-set cases.

Likely files:

```text
packages/domain/src/catalog.ts
packages/domain/src/catalog-sync.ts
packages/domain/test/schemas.test.ts
apps/desktop/electron/catalog/import.ts
apps/desktop/electron/catalog/ipc.ts
apps/desktop/test/catalog-files.test.ts
```

Phase outcome: the replaceable local catalog can answer which stable release
family owns every printing.

### Phase 2: Add local spoiler state and one visibility service

1. Add shared schemas for spoiler policy, reveal scope, reveal decision, release
   summary, visibility snapshot, and visible/protected printing results.
2. Add a `spoilerPolicy` workspace preference defaulting to `protect`.
3. Add a workspace table for printing and root-release decisions. Store reveal
   and protect tombstones with reset generation, local revision, pending sync
   state, and remote version; do not store arrays inside one preference value.
4. Implement workspace operations to reveal or protect one printing, reveal or
   protect one root release, enable “Always show,” and protect all previews.
5. Include spoiler policy and decisions in validated workspace backups. Import
   replaces them with the rest of the workspace only after the existing backup
   confirmation.
6. In the Electron main process, derive a trusted visibility snapshot from the
   active workspace and local date. Renderer IPC exposes state and named reveal
   actions, never a caller-supplied visibility override.
7. Schedule a refresh for the next local midnight, publish a spoiler-state
   revision, and invalidate catalog queries so cards release without restarting
   the app.
8. Test persistence, workspace switching, backup round-trips, reset generation,
   broader-scope precedence, and the local-midnight boundary with an injected
   clock.

Likely files:

```text
packages/domain/src/spoilers.ts
packages/domain/src/index.ts
apps/desktop/electron/workspace/preferences.ts
apps/desktop/electron/workspace/store.ts
apps/desktop/electron/workspace/backup.ts
apps/desktop/electron/spoilers/service.ts
apps/desktop/electron/main.ts
apps/desktop/electron/preload.ts
apps/desktop/src/electron.d.ts
apps/desktop/test/workspace-store.test.ts
apps/desktop/test/workspace-backup.test.ts
apps/desktop/test/spoiler-service.test.ts
```

Phase outcome: reveal decisions work and persist locally, independent of the
replaceable catalog.

### Phase 3: Enforce protection in catalog reads and ship the direct gate

1. Add one catalog visibility predicate used by list, detail, sibling, set, and
   image-source queries. The main process attaches the trusted workspace
   snapshot to worker operations after validating renderer input.
2. Filter protected printings before unique-card window ranking, ordering,
   counting, and pagination. A revealed printing becomes eligible normally.
3. Change detail lookup to return a discriminated visible/protected result. A
   protected result reads only the minimum release-family fields; it must not
   parse or normalize complete raw card JSON.
4. Filter protected sibling printings from otherwise visible card details.
5. Make image-source lookup apply the same visibility predicate before resolving
   a remote URL. Existing cached bytes remain stored but inaccessible through
   `mooligan-image` while protected.
6. Add a protected route state with the agreed copy and reveal actions. Invalidate
   list, detail, and image queries after a decision so the revealed printing
   appears immediately.
7. Ensure focus moves to the protected heading or revealed card heading as
   appropriate. Use no reveal animation; the explicit action and content change
   provide sufficient feedback.
8. Test an unseen new card, an unreleased reprint, unique-card representative
   selection, protected siblings, direct routes, invalid printing IDs, cached
   image refusal, reveal persistence, and automatic release.

Likely files:

```text
apps/desktop/electron/catalog/query.ts
apps/desktop/electron/catalog/detail.ts
apps/desktop/electron/catalog/query-worker.ts
apps/desktop/electron/catalog/ipc.ts
apps/desktop/electron/catalog/image-protocol.ts
apps/desktop/src/routes/cards.$printingId.tsx
apps/desktop/src/features/cards/use-card-detail.ts
apps/desktop/src/features/cards/card-detail.tsx
apps/desktop/src/features/cards/printing-gallery.tsx
apps/desktop/test/catalog-image-protocol.test.ts
apps/desktop/test/card-navigation.test.ts
apps/desktop/test/spoiler-catalog.test.ts
```

Phase outcome: a default-protected user cannot encounter unreleased card
characteristics through ordinary search, card routes, siblings, or artwork,
and can durably reveal one printing end to end.

### Phase 4: Add Upcoming Releases, settings, and release reveals

1. Add a catalog query returning root release families with future visible or
   protected printings. Before reveal, return only the approved release summary;
   compute the earliest future effective printing date in the family and never
   return card or progress counts.
2. Replace the placeholder Sets route with an Upcoming section. Group by root
   release family and provide “Reveal this release.” Entering through any child
   resolves and stores the root ID.
3. Add a trusted on-demand set-symbol path. Restrict it to catalog-provided HTTPS
   URLs on `svgs.scryfall.io`, validate `image/svg+xml` and a small response-size
   limit, cache it outside the workspace, and serve it through an application
   protocol. Do not hotlink symbols or expose arbitrary URLs.
4. Add an Upcoming tab to search backed by a dedicated paginated query over all
   future printings. Return a visible card result when consent permits it and a
   separate protected result containing only printing ID, release summary, and
   date otherwise. Link protected rows to the direct printing gate.
5. Add the Spoiler Protection section to Settings with global policy, active
   reveal management, scope explanations, and “Protect all previews.” Preserve
   the narrower records while global show is enabled.
6. Add “Protect this printing” and “Protect this release” at their natural
   detail and release surfaces. Explain and disable a narrow action when broader
   consent currently controls visibility.
7. Test future subsets added after a family reveal, deep parent chains,
   re-protection, global show toggling, reset, inaccessible symbols, keyboard
   focus, and screen-reader names.

Likely files:

```text
apps/desktop/electron/catalog/query.ts
apps/desktop/electron/catalog/query-worker.ts
apps/desktop/electron/catalog/set-symbol-protocol.ts
apps/desktop/electron/main.ts
apps/desktop/src/routes/sets.tsx
apps/desktop/src/routes/search.tsx
apps/desktop/src/routes/settings.tsx
apps/desktop/src/features/search/search-controls.tsx
apps/desktop/src/features/search/search-results.tsx
apps/desktop/src/features/search/use-catalog-upcoming-printings.ts
apps/desktop/src/features/preferences/use-preferences.ts
apps/desktop/src/features/spoilers/*
apps/desktop/test/spoiler-catalog.test.ts
apps/desktop/test/spoiler-ui-state.test.ts
```

Phase outcome: users can intentionally discover every future printing and
manage preview visibility without ordinary Card index search disclosing
protected content.

### Phase 5: Synchronize spoiler choices without weakening protection

1. Extend the optional workspace sync contract with global spoiler state and
   per-target printing/release decisions. Keep motion synchronization working
   through the same coordinator but do not force heterogeneous data into the
   current single-value update shape.
2. Store stable target ID, scope, state, reset generation, server version, and
   updated time remotely. Use strict request and response schemas and bounded
   batches.
3. Require the client's base version when mutating a target. Accept a cleanly
   ordered update normally; resolve concurrent reveal/protect values to protect
   and return the authoritative record.
4. Synchronize “Protect all previews” as a generation advance. Reject or
   neutralize stale reveal operations from older generations so an offline
   device cannot resurrect them.
5. Keep the local SQLite state authoritative while offline. New devices start
   protected, then apply validated remote state after account binding.
6. Update sync status so pending spoiler decisions participate in “pending” and
   “paused” states without blocking local reads or reveal actions.
7. Extend API, workspace, coordinator, and multi-device tests for ordered
   changes, concurrent conflicts, offline queues, reset races, account switches,
   malformed payloads, and service outages.
8. Modify the existing pre-release baseline schema rather than maintaining a
   compatibility path for the current motion-only constraint.

Likely files:

```text
apps/api/migrations/0001_initial.sql
apps/api/src/sync.ts
apps/api/test/sync.test.ts
apps/desktop/electron/workspace/store.ts
apps/desktop/electron/workspace/preference-sync.ts
apps/desktop/electron/main.ts
apps/desktop/test/preference-sync.test.ts
```

Phase outcome: the same spoiler choices follow an optional signed-in workspace,
and uncertain synchronization always fails protected.

### Phase 6: Apply the invariant to user-owned content as those surfaces land

Do not build collection, deck, list, export, or sharing workflows solely for
this feature. When each real workflow is implemented:

1. Resolve its printing IDs through the same trusted visibility service.
2. Preserve protected entries and display only quantity plus a generic gated
   row with a printing reveal action.
3. Exclude protected characteristics from visible mana curves, colors, types,
   legalities, prices, recommendations, and other analytics. Show only a
   generic protected quantity where structural totals require it.
4. Preserve exact IDs in backup, export, and share payloads. Warn generically
   before export and apply the recipient's own visibility state on import/open.
5. Test mixed released/protected artifacts so only affected rows are gated and
   mutations never discard concealed entries.

## Acceptance criteria

- A fresh workspace cannot see future card characteristics through Card index
  browse, text search, unique-card search, direct detail, sibling galleries, or
  card-image URLs.
- Searching for a protected exact name produces the same visible result shape
  as any other no-match query; no hidden-match fact is disclosed.
- The Upcoming tab lists every future printing. Protected items expose only a
  generic label, root release name/code/symbol, and printing release date, and
  selecting one reaches the exact-printing reveal gate.
- An unreleased reprint never displaces the newest released representative.
- Revealing one printing persists across restart and reveals no sibling
  printing or treatment.
- Revealing from any subset reveals its root release family and all current or
  later descendants.
- “Always show previews” reveals everything without deleting narrower choices;
  disabling it restores those choices.
- “Protect all previews” prevents older offline reveal state from resurfacing.
- Protection ends automatically on the printing's release date using the local
  calendar without requiring a restart or network request.
- A protected image remains unavailable through the application protocol even
  if its bytes were cached during an earlier reveal.
- The Upcoming Sets surface exposes only family name, code/symbol, and date
  before reveal.
- Optional synchronization never makes a concurrent or ambiguous conflict more
  revealing.
- The feature passes `vp check`, `vp test`, and all relevant package scripts.

## Deferred capabilities

- Notifications about newly previewed cards.
- Custom delays beyond the official release date.
- Per-device spoiler policies that diverge from the synchronized workspace.
- Preview-source attribution or a chronological spoiler feed.
- Protection against direct inspection of local catalog or cache files outside
  Mooligan.
