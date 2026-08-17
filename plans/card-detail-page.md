# Card Detail Page

Status: ready for implementation

## Objective

Give every catalog printing a directly linkable, offline card detail experience
that clearly separates shared card information from the currently selected
printing and can later support collection, deck, and list workflows.

## Product constraints

- The complete inspection workflow must work from the local catalog without an
  account or network connection.
- The page must support catalog records that lack a shared rules identity.
- Printing-sensitive actions must never silently choose a representative
  printing.
- The first implementation slice must work end to end before additional card
  management capabilities are layered on top.

## Accepted decisions

### Card-centered experience with printing-addressed routes

Use `/cards/$printingId`. The selected printing is directly linkable and
switching printings navigates to the new printing's URL. Shared card facts are
shown once; printing facts and printing-sensitive actions use the selected
printing. See [ADR 0001](../docs/adr/0001-card-detail-identity-and-routing.md).

### First slice is a read-only inspection loop

The initial implementation will let a user:

1. Open a printing from search.
2. Inspect its complete first-slice card and printing information offline.
3. Browse sibling printings while remaining in the same card-centered
   experience.
4. Return to the search results with the previous query, filters, view, and
   position intact.

The first slice will not show collection, deck, or list actions. Those controls
will be added only when they can perform real locally persisted mutations.
Pricing, rulings, and other data that is not selected during discovery will
also remain out of scope rather than appearing as empty sections.

### Oracle-text-first information hierarchy

The page will prioritize answering what the card currently does:

1. Selected-printing artwork.
2. Card name, mana cost, current type line, Oracle text, and applicable power,
   toughness, loyalty, or defense values.
3. Selected-printing set, collector number, rarity, release date, language,
   artist, and available finishes.
4. Sibling printings.
5. Format legalities as secondary information.

“Oracle text” means the card's current official rules text. It does not include
card rulings, general game rules, strategy guidance, or explanatory content.
Prices and rulings are outside the first slice.

### Multi-face cards expose every face's Oracle information

For any card with multiple faces, the page will render every face's name, mana
cost, type line, Oracle text, and applicable stats in catalog order. This
information remains simultaneously visible and is not coupled to an artwork
toggle.

The artwork viewer may switch between the selected printing's available face
images because the large artwork area represents one physical face at a time.
Changing the visible artwork does not change the selected printing or URL.

Transform, modal double-faced, split, adventure, and other multi-face layouts
will use the same ordered-face rendering model. Layout-specific presentation
may improve readability, but no layout gets a separate domain entity or route.

### Sibling printings use an incremental visual gallery

Below the main card details, display sibling printings as a visual grid. Each
item includes:

- Artwork thumbnail.
- Set name and code.
- Collector number.
- Release year.
- Rarity.
- Language.
- Visible digital and promo labels when applicable.
- A clear selected-printing state.

Every catalog printing with the same shared rules identity is eligible,
regardless of the search filters used to enter the page. Order siblings by
release date descending, then set code and collector number for deterministic
ties. Records without a shared rules identity omit the gallery.

Render the first 24 printings and reveal subsequent batches of 24 with a “Show
more” action. Thumbnail images use the search result image-loading pattern: do
not request off-screen images until they approach the viewport. Selecting a
sibling navigates to its `/cards/$printingId` route.

### Back history and return-to-results are separate

Opening a result pushes the card route onto history. Switching sibling
printings also pushes each selected printing route, so browser or operating
system Back follows the user's actual printing history.

The page separately provides a visible “Back to results” control. It returns
directly to the originating search location, including query, filters, and
grid/list mode, and restores the previous scroll position. Carry this origin as
ephemeral router state through sibling navigation; do not add it to the
shareable card URL.

When no valid in-app search origin exists, replace the control with “All cards”
linking to `/search`.

### Artwork uses a persistent on-demand cache

The first slice will introduce the shared device-local image cache described in
[ADR 0002](../docs/adr/0002-persistent-catalog-image-cache.md).

Oracle text and metadata always render offline. Cached artwork also renders
offline; uncached artwork shows an “Artwork unavailable offline” placeholder
without degrading the rest of the page. Search thumbnails, main detail art,
multi-face art, and sibling thumbnails use the same cache. Mooligan will not
bulk-download artwork.

### Oracle symbols render locally without hiding source text

Recognized brace tokens in mana costs and Oracle text, such as `{T}`, `{G}`, or
`{2/W}`, render as familiar Magic symbols in the first slice.

- Use the established `mana-font` package as a Vite-bundled application asset;
  it must not depend on a CDN or runtime network request.
- Each visual symbol has an accessible text name.
- Selecting or copying Oracle text preserves the canonical brace token.
- Unknown or newly introduced tokens remain visible in brace notation.
- A missing or failed symbol asset falls back to brace notation and never
  prevents the card page or its Oracle text from rendering.
- Oracle text is parsed as text and symbol tokens; catalog content is never
  injected as HTML.

### Responsive composition keeps Oracle information primary

On wide windows, use a two-column detail composition:

```text
Back to results

┌──────────────────┬────────────────────────────────────┐
│ Selected artwork │ Name                       Mana cost│
│ (sticky on wide) │ Type line                           │
│                  │ Oracle text for every face          │
│ Face controls    │ Power/toughness, loyalty, defense   │
│                  │                                     │
│                  │ Selected-printing details           │
│                  │ Format legalities                   │
└──────────────────┴────────────────────────────────────┘

Sibling printings — full-width visual grid
```

The artwork column may remain sticky only while the complete image and its face
controls fit within the viewport. The Oracle-information column always scrolls
normally.

On narrow windows, use one column in this order: artwork, every face's Oracle
information, selected-printing details, legalities, and sibling printings.

No information or action depends on hover. Artwork face controls are real
buttons with visible focus states and accessible face names. Sibling items are
links, with the selected printing exposed as the current item. Artwork changes
may cross-fade when full motion is allowed; reduced motion changes it
immediately. Oracle information never animates behind an artwork control.

### Failure states preserve truthful card information

- Initial local loading uses a stable skeleton that reserves the artwork and
  Oracle-information regions.
- Navigating to another printing never shows the previous printing's content
  under the new URL.
- An unknown or removed printing renders “Printing unavailable” with both the
  origin-aware return control and a “Search all cards” action. It does not
  silently select or redirect to a sibling.
- A missing catalog delegates to the existing catalog-setup flow.
- Replacing the catalog invalidates and refetches the active detail. If the
  selected printing no longer exists, the page renders the unavailable state.
- Artwork loading and failures remain local to their image frames. Cached and
  remote image failures never hide Oracle text or printing metadata.
- Optional catalog fields with no value are omitted. Repeated “Unknown” or
  empty metadata rows are not rendered.

## Domain model

```text
Card (shared rules identity)
  1 ─── 0..* Printing
               │
               └── exactly one is Selected printing on the detail page
```

If the selected printing has no shared rules identity, the page still renders
that catalog record and omits the sibling-printing relationship.

## Decisions still to resolve

None for the first slice. New product scope should be layered on only after the
acceptance criteria below pass.

## Deferred capabilities

- Add to collection.
- Add to a deck or list.
- Ownership and deck-usage summaries.
- Any action that mutates the local workspace.

## Implementation plan

Each phase leaves the existing product working and has an independently
testable outcome. Do not add collection, deck, or list controls during these
phases.

### Phase 1: Add the typed catalog detail read model

1. Add `packages/domain/src/catalog-detail.ts` and export it from the domain
   package. Define schemas and inferred types for:
   - A card face's name, mana cost, type line, Oracle text, and optional power,
     toughness, loyalty, and defense.
   - The card-level identity, color identity, mana value, keywords, and ordered
     faces.
   - Selected-printing metadata and compact sibling-printing summaries.
   - Format legality entries using the existing legality status vocabulary.
   - Image descriptors that identify printing, face index, and supported size
     without exposing a remote URL.
   - The complete `CatalogCardDetail` read model.
2. Normalize a record with no Oracle ID into a standalone card identity based
   on its printing ID while retaining `hasSharedIdentity: false`. It therefore
   has a valid card detail but no sibling group.
3. Map a single-face Scryfall record into one face and preserve `card_faces`
   order for multi-face records. Do not create layout-specific domain types.
4. Map Scryfall's `not_legal` value to the domain's `not-legal` spelling at the
   catalog boundary. Preserve unknown future format identifiers with readable
   generated labels instead of discarding their status.
5. Expand `ScryfallCardDownloadSchema` only far enough to validate the fields
   needed by this read model. Keep legitimately missing printing fields
   optional so tokens, art cards, and unusual layouts remain inspectable.
6. Parse the normalized read model with its domain schema before it crosses the
   worker boundary. Raw Scryfall JSON must not reach the renderer.

Likely files:

```text
packages/domain/src/catalog-detail.ts
packages/domain/src/catalog-sync.ts
packages/domain/src/index.ts
packages/domain/package.json
packages/domain/test/schemas.test.ts
```

Phase outcome: representative single-face, multi-face, and standalone catalog
records normalize into one stable, validated detail contract.

### Phase 2: Extend the catalog query worker and preload boundary

1. Add a pure detail query beside the existing list query. It should:
   - Select the exact printing by ID with a prepared statement.
   - Return `null` for an absent printing rather than treating absence as a
     worker failure.
   - Read the selected record's full stored JSON.
   - If `oracle_id` exists, use the existing `cards_oracle_id` index to load all
     matching printings.
   - Normalize the selected record and compact sibling summaries into the
     domain read model.
   - Sort sibling summaries by release date descending, then set code and
     collector number with stable numeric-aware comparison.
2. Replace the worker's list-only message with a discriminated union of
   `list`, `detail`, and internal `image-source` operations. Do not retain the
   obsolete untagged request shape.
3. Generalize the pending worker-operation map so each response resolves only
   the matching operation and malformed responses fail closed.
4. Add a narrow `catalog:detail` IPC handler. Validate the printing ID as a
   nonempty bounded string before the prepared query; invalid route values
   return the same missing result and never reach SQL.
5. Expose `window.catalog.detail(printingId)` through the sandboxed preload and
   type it in `src/electron.d.ts`. Keep `image-source` private to the main
   process.
6. Preserve the existing catalog replacement barrier. A detail or image-source
   query in flight during replacement fails, then React Query retries through
   the newly created worker after the `catalogready` invalidation.

Likely files:

```text
apps/desktop/electron/catalog/detail.ts
apps/desktop/electron/catalog/query.ts
apps/desktop/electron/catalog/query-worker.ts
apps/desktop/electron/catalog/ipc.ts
apps/desktop/electron/preload.ts
apps/desktop/src/electron.d.ts
apps/desktop/test/catalog-files.test.ts
```

Phase outcome: the renderer can request one validated detail read model or a
truthful missing result without filesystem, SQLite, or raw source-data access.

### Phase 3: Deliver the minimal offline detail route

1. Add the TanStack file route `src/routes/cards.$printingId.tsx` for
   `/cards/$printingId` and regenerate `routeTree.gen.ts` through the router
   plugin rather than editing it manually.
2. Add `useCatalogCardDetail(printingId)` with a React Query key of
   `['catalog', 'detail', printingId]`, infinite stale time, no placeholder data
   from another printing, and no network-dependent query function.
3. Turn every list and grid search result into a semantic link to the selected
   printing route. Preserve the current row/tile styling and visible focus
   treatment; do not add nested click handlers to the list item.
4. Render the smallest complete page first:
   - Origin-aware return control or `All cards` fallback.
   - Stable loading skeleton.
   - Selected card name, mana cost, type line, Oracle text, and stats.
   - Selected-printing metadata.
   - Deliberate artwork placeholder until Phase 4 connects the cache.
   - Printing-unavailable state.
5. Omit absent optional metadata rows. Keep all readable data usable without an
   installed image.

Likely files:

```text
apps/desktop/src/routes/cards.$printingId.tsx
apps/desktop/src/features/cards/use-card-detail.ts
apps/desktop/src/features/cards/card-detail.tsx
apps/desktop/src/features/cards/card-artwork.tsx
apps/desktop/src/features/cards/printing-details.tsx
apps/desktop/src/features/search/search-results.tsx
apps/desktop/src/routeTree.gen.ts
```

Phase outcome: search opens a real local card page, direct URLs work, and
single-face Oracle and printing data are useful with the network disabled.

### Phase 4: Add the shared persistent artwork cache

Implement [ADR 0002](../docs/adr/0002-persistent-catalog-image-cache.md) as a
separate service so it is useful before the rest of the card-page polish lands.

1. Register the `mooligan-image` scheme as secure before `app.whenReady()` and
   attach its handler to the default session after Electron is ready.
2. Resolve `printingId`, `faceIndex`, and `small | normal` through the internal
   catalog `image-source` operation. Do not accept a source URL from the
   renderer.
3. Implement a cache below `app.getPath('cache')`:
   - SHA-256 of the complete canonical source URL as the file key.
   - URL-derived, allowlisted image extension.
   - Temporary download followed by atomic rename.
   - Expected image content type and a conservative maximum response size.
   - One shared promise for concurrent requests to the same key.
   - Access-time updates and least-recently-used eviction above 512 MiB.
   - Cleanup of abandoned temporary files at startup.
4. Serve cached responses immediately, fetch and commit uncached images when
   online, and return an unavailable response without retry loops when offline.
5. Replace remote image URLs in existing search summaries with safe image
   descriptors and migrate search list/grid images to `mooligan-image`.
6. Connect `normal` images to the main artwork viewer and `small` images to
   search and sibling thumbnails.
7. After every renderer image has migrated, update both development and
   production CSPs to allow `mooligan-image:` and remove direct
   `https://cards.scryfall.io` image access.

Likely files:

```text
apps/desktop/electron/catalog/image-cache.ts
apps/desktop/electron/catalog/image-protocol.ts
apps/desktop/electron/catalog/detail.ts
apps/desktop/electron/main.ts
apps/desktop/electron/catalog/query.ts
apps/desktop/src/features/cards/card-artwork.tsx
apps/desktop/src/features/search/search-results.tsx
apps/desktop/src/features/search/search-image-loading.ts
apps/desktop/vite.config.ts
apps/desktop/test/catalog-image-cache.test.ts
apps/desktop/test/catalog-files.test.ts
```

Extract the existing visibility/concurrency coordinator into a catalog-image
loading utility instead of creating a second independent loader for the sibling
gallery.

Phase outcome: search and detail artwork already viewed on this device survives
restart and loss of connectivity, while uncached images fail independently.

### Phase 5: Complete Oracle, face, and legality presentation

1. Add `mana-font` to the desktop workspace with Vite+ and bundle its font and
   CSS locally. Do not reference its CDN. The intended package command is:

   ```sh
   vp add -D mana-font --filter desktop --save-catalog
   ```

2. Build a small Oracle tokenizer that splits newline-delimited text and
   recognized brace tokens. It must not parse HTML. Test ordinary mana, hybrid,
   Phyrexian, variable, tap/untap, and unknown tokens.
3. Render familiar symbols for known tokens with accessible labels while
   preserving canonical brace text for copying. Leave unknown tokens literal.
4. Render every face's Oracle-information block simultaneously in catalog
   order. Use a single block for top-level single-face records.
5. Give the artwork viewer one button per available face image. Switching art
   changes only the image, uses a short cross-fade under full motion, and is
   immediate under reduced motion.
6. Render every supplied format legality in a compact secondary section. Show
   status with text as well as color, use a stable common-format order, and
   append previously unknown formats rather than hiding them.

Likely files:

```text
pnpm-workspace.yaml
apps/desktop/package.json
apps/desktop/src/global.css
apps/desktop/src/features/cards/oracle-text.tsx
apps/desktop/src/features/cards/card-faces.tsx
apps/desktop/src/features/cards/card-artwork.tsx
apps/desktop/src/features/cards/card-legalities.tsx
apps/desktop/test/oracle-text.test.ts
```

Phase outcome: single- and multi-face cards expose complete, accessible Oracle
information with offline symbols and legible legalities.

### Phase 6: Add sibling browsing and exact return navigation

1. Render sibling printings in the accepted full-width gallery. Start with 24
   entries and add batches of 24.
2. If the selected printing falls after the first batch, round the initial
   visible count up to the next batch so the selected item is never hidden.
3. Reuse the shared visibility-based image loader. Only gallery items near the
   viewport request small images.
4. Preserve the search origin as typed history state containing the validated
   search values, not an arbitrary href. Carry it through every sibling link.
5. Enable TanStack Router's built-in `scrollRestoration` option. Mark the
   scrollable `<main>` with a stable `data-scroll-restoration-id`; the installed
   router already keys restoration by `location.href`, so returning to the same
   search URL restores its scroll entry.
6. `Back to results` navigates directly to the typed search origin. Normal
   browser or operating-system Back remains untouched and therefore steps
   through selected-printing history.
7. On direct entry or malformed history state, render the `All cards` fallback.

Likely files:

```text
apps/desktop/src/main.tsx
apps/desktop/src/routes/__root.tsx
apps/desktop/src/routes/cards.$printingId.tsx
apps/desktop/src/features/cards/card-navigation.ts
apps/desktop/src/features/cards/printing-gallery.tsx
apps/desktop/src/features/search/search-results.tsx
apps/desktop/test/card-navigation.test.ts
```

Phase outcome: users can browse any printing, copy its exact URL, traverse
printing history, or jump directly back to an intact result set.

### Phase 7: Finish responsive polish and focus behavior

1. Implement the accepted wide two-column and narrow single-column composition
   with StyleX. Use the existing 820 px compact-shell breakpoint as the initial
   alignment point, but disable sticky artwork whenever it cannot fit fully in
   the available viewport height.
2. On a completed route navigation, place programmatic focus on the page heading
   only when navigation came from another route—not when a user merely switches
   artwork faces.
3. Ensure face buttons, return controls, gallery links, and `Show more` have
   visible focus states and logical document order.
4. Keep the selected gallery item exposed with `aria-current`, give every image
   useful alt text, and ensure legality status is not communicated by color
   alone.
5. Verify long Oracle text, missing optional fields, two-face artwork, no-image
   records, and more than 24 printings at both the minimum and default window
   sizes.
6. Keep route and image motion under the existing global `MotionConfig`; do not
   add an independent reduced-motion preference path.

Phase outcome: the page is keyboard-complete, responsive within the supported
desktop window, and truthful under every accepted data state.

## Query and validation contract

```text
renderer
  window.catalog.detail(printingId)
        │ validated IPC input
        ▼
main-process catalog query client
        │ tagged detail operation
        ▼
read-only SQLite worker
  exact printing ── oracle_id ── sibling printings
        │ normalize + schema-parse
        ▼
CatalogCardDetail | null
```

Rules:

- `null` means the printing does not exist. Operational failures reject with a
  generic catalog-read error; the UI must not conflate the two.
- Prepared SQL receives the validated ID. The renderer never supplies SQL,
  paths, or source URLs.
- The selected printing is always included in the returned printing set and is
  identified explicitly rather than inferred from ordering.
- All card faces preserve source order.
- Sibling eligibility is exact non-null `oracle_id` equality. Search filters do
  not participate.
- Catalog replacement stops the old worker, atomically replaces SQLite, and
  invalidates every `['catalog', ...]` React Query entry through the existing
  `catalogready` event.

## Test strategy

### Domain and query tests

- Single-face normalization from top-level fields.
- Ordered multi-face normalization with different names, mana costs, text,
  images, and stats.
- Printing without `oracle_id` yields a standalone card and no siblings.
- All printings sharing `oracle_id` are returned in the accepted order,
  including digital and promo records.
- Missing printing returns `null`; malformed bounded input is rejected before
  SQL.
- Legality spelling and unknown-format preservation.
- Worker request/response correlation for list, detail, and image-source
  operations.
- Catalog replacement rejects old in-flight work and permits a new detail read.

### Image-cache tests

- First request downloads once; later requests and restarts use the file.
- Concurrent identical requests share one download.
- Single- and multi-face image-source resolution.
- Offline miss and HTTP failure return unavailable without repeated retries.
- Wrong host, non-HTTPS URL, unsupported size, bad content type, and oversized
  response fail closed.
- Partial writes never become cache hits and abandoned partials are cleaned.
- Least-recently-used eviction respects the 512 MiB budget.

### Renderer logic tests

- Oracle tokenization, newlines, accessible labels, copying, and unknown-token
  fallback.
- Gallery batching always includes the selected printing.
- Valid search history state survives sibling navigation; malformed state uses
  the fallback.
- Search state remains compatible with existing query validation.

### Manual desktop checks

1. Browse in both search layouts, open a printing, switch siblings, use normal
   Back, then use `Back to results` and verify filters, loaded pages, and scroll.
2. Open a copied card URL directly and verify `All cards` behavior.
3. Restart offline after viewing artwork and verify cached images; open an
   uncached printing and verify the offline placeholder with complete text.
4. Inspect single-face, transform, modal double-faced, split, adventure, token,
   art-series, promo, digital, and no-image records.
5. Navigate the entire page using only the keyboard at default and minimum
   window sizes with system, reduced, and full motion preferences.
6. Replace the catalog while a detail page is open and verify refetch or the
   printing-unavailable state.

Repository validation after each phase:

```sh
vp check
vp run -r test
vp run -r build
```

Run the root `vp run ready` task before handing off the completed feature.
The repository's raw `vp test` discovery path currently treats its `node:test`
files as Vitest suites and lacks the API's Cloudflare pool; use the declared
workspace test tasks above until that separate toolchain configuration is
unified.

## Acceptance criteria

- Every search result opens `/cards/$printingId`, and reloading that URL selects
  the same printing.
- Card identity and selected-printing metadata are visually and structurally
  distinct.
- Every face's Oracle information is visible simultaneously and recognized
  symbols render locally with accessible literal fallback.
- The selected printing's available artwork faces can be viewed without hiding
  any Oracle information.
- All sibling printings sharing the card identity are reachable in deterministic
  batches, with digital and promo records labeled.
- The page's text and metadata work without a network or account.
- Viewed artwork survives restart and offline use; uncached artwork failure does
  not fail the page.
- Browser Back follows printing history, while `Back to results` restores the
  originating search state and scroll position directly.
- Unknown printing IDs, catalog replacement, missing optional fields, and image
  failures render the accepted truthful states.
- No collection, deck, or list mutation control appears.
- No raw Scryfall record, remote artwork URL, filesystem path, or database
  handle crosses into the renderer.

## References

- [ADR 0001: Card detail identity and routing](../docs/adr/0001-card-detail-identity-and-routing.md)
- [ADR 0002: Persistent on-demand catalog image cache](../docs/adr/0002-persistent-catalog-image-cache.md)
- [Scryfall API access guidance](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17)
- [Mana symbol font](https://github.com/andrewgioia/mana)
