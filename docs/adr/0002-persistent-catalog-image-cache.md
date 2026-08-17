# ADR 0002: Persistent On-Demand Catalog Image Cache

Status: accepted

Date: 2026-08-14

## Context

Mooligan's card catalog is stored locally, but Scryfall card records contain
remote artwork URLs. Directly rendering those URLs makes artwork unavailable
without a network connection and allows the renderer to bypass application
cache policy.

Bulk-downloading artwork would make catalog setup and updates excessively large
and would store images a user may never view. Relying only on Chromium's HTTP
cache would make persistence, capacity, offline behavior, and testability
implicit.

Scryfall recommends its bulk data offerings for large downloads. Its official
access guidance states that static files on `*.scryfall.io` do not use the API
request limit, but Mooligan should still avoid redundant downloads:
<https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17>.

## Decision

Mooligan will use one persistent, on-demand catalog image cache shared by
search, card details, and sibling-printing galleries.

- The Electron main process owns image retrieval, validation, persistence, and
  eviction. The renderer never chooses an arbitrary remote resource for the
  cache to fetch.
- Image requests identify a catalog printing, face, and supported image size.
  The main process resolves the corresponding URL from trusted catalog data and
  permits HTTPS card-image resources from the expected Scryfall image host.
- Register `mooligan-image` as a secure application protocol before Electron is
  ready, and attach its handler after the default session exists. Renderer URLs
  use the form
  `mooligan-image://catalog/$printingId/$faceIndex/$size`; they never contain or
  expose the remote source URL.
- Permit only the `small` and `normal` size values, nonnegative face indexes,
  and printing IDs that resolve through the installed catalog. Fetch only HTTPS
  resources whose hostname is exactly `cards.scryfall.io`.
- Use Scryfall's small image for thumbnails and normal image for the main detail
  artwork. Do not fetch large or PNG variants in the first slice.
- Cache files are keyed by the complete canonical source URL. A changed source
  URL naturally creates a new entry rather than serving an older revision.
- Downloads use temporary files followed by atomic rename. Accept only expected
  image response types and enforce a response-size limit before committing a
  file.
- Concurrent requests for the same image share one in-flight download.
- The initial cache budget is 512 MiB. Evict least-recently-used files after a
  successful write when the budget is exceeded.
- Store the cache below Electron's operating-system cache path, outside both the
  user-owned workspace and the replaceable catalog database. It is neither
  synchronized nor included in workspace backups.
- Cached artwork remains available offline. An uncached offline image produces
  a typed unavailable result and a deliberate placeholder; it does not fail the
  surrounding card page.
- Image failures use bounded retry behavior. The application must not retry
  indefinitely or create repeated requests for a known failure during one
  session.

## Consequences

- Previously viewed artwork survives restarts and network outages.
- Search thumbnails and card-detail artwork do not download duplicate copies of
  the same size.
- The desktop application needs a narrow catalog image-source query, a custom
  protocol handler, and cache lifecycle tests.
- Once search uses the cache, the renderer content security policy can remove
  direct access to `https://cards.scryfall.io` and allow `mooligan-image:`
  instead.
- Catalog inspection remains functional even when every image is unavailable.
- Cache eviction can remove artwork without risking user-owned data.
- A future device-local setting may expose the cache budget or a clear-cache
  action without changing card or workspace models.
