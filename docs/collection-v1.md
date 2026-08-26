# Collection v1

Status: implemented

Agreed: 2026-08-21

## Goal

Collection v1 lets a user record and manage the paper Magic cards they own. The
complete workflow works locally, without an account, and does not depend on deck
contents.

The smallest useful loop is:

1. Find an exact printing in Search or open its card detail page.
2. Add one or more copies with a finish, language, and condition.
3. See the resulting Holding in Collection.
4. Adjust its quantity or properties, or remove it.

## Current implementation

LiveStore in the Electron renderer is the only durable source for Collection
lots. The renderer commits versioned collection events and reads their
materialized `collection_lots` state. Optional Account synchronization carries
the same event log to another device.

The renderer projects a validated lot snapshot and ordered deltas into a
temporary table in the catalog query worker. That table exists only for
spoiler-safe catalog joins and is rebuilt after a renderer reload, Workspace
switch, revision gap, or worker restart. It is not backed up or synchronized.

The earlier Workspace SQLite store, generic collection entity methods, mutation
IPC, and SQL attachment path have been removed. There is no conversion path for
those development-era databases.

## Scope

Collection v1 includes:

- One collection per workspace.
- Every non-digital catalog printing, including tokens, emblems, art cards, and
  novelty cards.
- Add actions on visible Search results and visible card detail pages.
- A list view and a grid view of Holdings.
- Name search and one active value per filter category.
- Set, finish, language, and condition filters.
- Name, set, and quantity sorting.
- Batches of 100 Holdings.
- Quantity changes, property changes, collision merging, and confirmed removal.
- Spoiler-safe rows and totals.
- Durable workspace backups containing every collection lot field.
- Optional Account synchronization of collection events.

Collection v1 does not include:

- Digital cards.
- Multiple collections inside one workspace.
- Collection ownership derived from decks or reserved by decks.
- Bulk selection or bulk editing.
- A UI for acquisition date, cost, storage location, or notes.
- Binder, page, slot, or card-position management.
- Collection import or export outside the existing workspace backup.
- Collection pricing or value totals.

## Domain model

### Collection

Each workspace owns one Collection. Decks may refer to the same printings, but
they do not consume, reserve, or move Collection copies.

### Collection lot

A Collection lot is the stored ownership record. Each lot has a stable UUID and
a positive quantity. It identifies one exact printing, finish, language, and
condition. It may also retain acquisition time, unit cost, storage location, and
notes.

Collection v1 creates only unattributed lots. All optional metadata is null on
these lots. Later workflows may create attributed lots without replacing this
table or changing the backup format.

### Holding

A Holding is a read model, not a stored row. The query groups lots by this key:

```text
printing ID + finish + language + condition
```

The Holding quantity is the sum of every matching lot quantity. One printing
may therefore appear as several Holdings.

The basic workflow keeps at most one unattributed lot for each Holding key. If
an add or edit reaches an existing key, it merges into that lot instead of
creating a duplicate.

### Distinct card

Header totals count distinct cards by shared catalog identity. If a catalog
record has no shared identity, its printing ID is the card identity. An
unavailable printing also falls back to its printing ID.

## Stored data

LiveStore materializes `collection_lots` with these fields:

| Field                 | Rule                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `id`                  | Primary key containing a stable ID                                                 |
| `printingId`          | Required exact catalog printing ID                                                 |
| `finish`              | `nonfoil`, `foil`, `etched`, or `glossy`                                           |
| `language`            | Required known card-language code                                                  |
| `condition`           | `near-mint`, `lightly-played`, `moderately-played`, `heavily-played`, or `damaged` |
| `quantity`            | Positive safe integer                                                              |
| `acquiredAt`          | Optional ISO 8601 timestamp                                                        |
| `unitCostAmountMinor` | Optional nonnegative safe integer                                                  |
| `unitCostCurrency`    | Optional uppercase ISO 4217 code paired with the amount                            |
| `locationId`          | Optional future storage-location ID                                                |
| `notes`               | Optional user notes                                                                |

The shared event schema checks the enums, quantities, IDs, and paired cost
values before an event enters local or remote history. Materializers merge
unattributed lots by Holding key. Tests cover concurrent offline additions,
collision merges, stale edits after removal, and deterministic replay.

There is no `workspaceId` field. One personal Workspace maps to one LiveStore
`storeId`.

## Supported values

### Finish

The shared finish model adds `glossy` to the current `nonfoil`, `foil`, and
`etched` values. The catalog importer, catalog details, collection schemas, and
LiveStore event schemas use the same set.

### Language

The known list uses Scryfall's card-language codes:

| Code  | Language            | Code  | Language           |
| ----- | ------------------- | ----- | ------------------ |
| `en`  | English             | `es`  | Spanish            |
| `fr`  | French              | `de`  | German             |
| `it`  | Italian             | `pt`  | Portuguese         |
| `ja`  | Japanese            | `ko`  | Korean             |
| `ru`  | Russian             | `zhs` | Simplified Chinese |
| `zht` | Traditional Chinese | `he`  | Hebrew             |
| `la`  | Latin               | `grc` | Ancient Greek      |
| `ar`  | Arabic              | `sa`  | Sanskrit           |
| `ph`  | Phyrexian           |       |                    |

Source: [Scryfall API language codes](https://github.com/scryfall/api-types/blob/main/src/objects/Card/values/LanguageCode.ts)

The add form starts with the selected printing's language when it is known.
Users may choose another known language because the local default-card catalog
does not contain every localized printing as a separate record.

### Condition

The interface displays Near Mint, Lightly Played, Moderately Played, Heavily
Played, and Damaged. Storage uses the existing kebab-case values from the domain
schema.

## Read contract

### Query ownership

The catalog query worker opens the catalog read-only and maintains a temporary
copy of the active Workspace's projected lots. One SQL query performs:

- Lot grouping and quantity sums.
- Catalog enrichment.
- Spoiler enforcement.
- Name and property filtering.
- Sorting.
- Visible and protected totals.
- Pagination.

Electron main accepts the projection only from the active renderer, active
Workspace, and current projection session. It rejects revision gaps and clears
the temporary table before asking the renderer for a full replacement. A
Workspace switch cannot return an old worker response.

The join from lots to cards is a left join. A missing catalog record never
deletes or hides ownership data.

### Request

The renderer sends a strict request with these optional fields:

- `query`, limited to 500 characters.
- `setCode`.
- `finish`.
- `language`.
- `condition`.
- `sort`, with `name`, `set`, or `quantity`.
- `offset`, starting at zero.
- `limit`, fixed to 100 by the UI and capped at 100 by validation.

Each filter accepts one value. Active filter categories combine with AND. Name
search matches the catalog card name case-insensitively. Unavailable rows do not
match a name or set filter because those catalog facts are absent. They can
still match finish, language, and condition filters because those values belong
to the lot. Protected rows never participate in filtering, and their separate
copy count never changes in response to filters.

Name sort is the default and uses card name, set code, collector number, finish,
language, condition, and printing ID as stable tie breakers. Set sort uses set
name, collector number, card name, and the Holding key. Quantity sort is highest
first and then falls back to name order.

The first request returns 100 rows. "Load more" advances the offset by 100 while
keeping the current route state.

### Response variants

A visible Holding returns:

- Its complete Holding key.
- Shared card identity for distinct-card counting.
- Card name, artwork descriptor, set name and code, and collector number.
- Finish, language, condition, and total quantity.
- The stable lot ID when it contains one editable first-version unattributed
  lot.

A protected Holding returns only a route target for its protection gate, a
generic "Protected preview" label, and quantity. It returns no card identity,
printing metadata, artwork, finish, language, condition, filter values, or
derived characteristics. It stays read-only until the user reveals it. The
query reports protected copy quantity separately from visible totals.

An unavailable Holding returns its printing ID, finish, language, condition,
quantity, and an "Unavailable printing" label. It has no artwork or card-detail
link. Quantity, language, and condition remain editable. Finish stays fixed
because the catalog cannot confirm which finishes the missing printing
supports. The Holding remains removable. Totals count its copies and use its
printing ID as the distinct-card fallback.

### Totals

The response contains totals for the whole Collection and the current filter:

- Total visible and unavailable copies.
- Total visible and unavailable distinct cards.
- Total visible and unavailable Holdings.
- Protected copy quantity.

Protected printings do not contribute card identities or characteristics to
visible totals. The header can therefore say, for example, "1,240 copies across
687 cards, plus 3 protected copies." The filtered count appears next to the
active search and filters rather than replacing the Collection total.

## Mutation contract

The preload exposes Collection reads and printing validation. It exposes no
Collection write IPC and no storage access. The renderer validates the action,
asks Electron main to verify catalog-owned facts, then commits one of the
versioned LiveStore events. LiveStore is the sole write path.

### Add

Add accepts a printing ID, finish, language, condition, and positive whole-number
quantity.

Before committing, the renderer asks the catalog query worker through the
preload bridge for the trusted facts needed to validate the printing. The
printing must:

- Exist in the installed catalog.
- Be visible under the current spoiler policy.
- Be non-digital.
- List the requested finish as supported.

The language must belong to the known list but does not have to match the
catalog record. If catalog finish data is missing, the write fails because the
application cannot prove that the requested finish exists.

`v1.CollectionCopiesAdded` carries a new lot and addition ID. Its materializer
inserts a new unattributed lot or increments the existing lot with the same
Holding key. The existing lot ID survives.

### Update

Update identifies the editable lot by its stable UUID and supplies a positive
quantity, finish, language, and condition. It cannot change the printing ID.

`v1.CollectionLotChanged` validates the target properties with the same rules as
Add. If the target key already has an unattributed lot, the target lot survives,
its quantity increases by the requested source quantity, and the materializer
removes the source lot atomically. Otherwise the source lot keeps its ID and
receives the new values.

An unavailable lot is the exception to catalog validation. Its update may
change quantity, language, and condition after applying the normal domain
checks. It must preserve printing ID and finish because the catalog cannot
validate a replacement finish.

Collection v1 never rewrites attributed lots. Product-created Holdings contain
one unattributed lot, so their edit action is available. If an imported backup
contains attributed lots, the Holding remains visible but read-only until a
later lot-management workflow can preserve those details during edits.

### Remove

Remove identifies the editable lot by its stable ID. After confirmation, the
renderer commits `v1.CollectionLotRemoved`. Its materializer deletes only an
unattributed lot. Quantity zero is not an update shortcut.

An attributed or otherwise read-only Holding cannot be removed through the v1
Holding action. Workspace backup import remains the only v1 operation that can
replace those lots.

### Failure behavior

A failed mutation changes nothing. The form stays open, keeps the entered
values, and shows a plain error message. Controls remain disabled while a write
is pending so a double action cannot submit twice.

LiveStore refreshes the Collection query after success, then the projection
bridge sends the change to the catalog worker. The user stays on the current
Search, card detail, or Collection page and sees a brief confirmation.

## Interface behavior

### Collection route

`/collection` stores the following state in its query string:

- `query`
- `set`
- `finish`
- `language`
- `condition`
- `sort`

Invalid values fall back to the unfiltered, name-sorted view. Clearing search
or filters updates the route, so refresh and navigation reproduce the same
result.

List is the default view. Grid is a separate device-local Collection preference
and does not enter the route or workspace backup.

### List view

Each visible row contains artwork, card name, set, collector number, finish,
language, condition, quantity, edit and remove actions, and a link to the exact
printing detail page.

The detail link carries the current Collection route as its return origin. The
card page then shows "Back to collection" and restores the same search, filters,
and sort.

Protected and unavailable response variants use the reduced content described
in the read contract.

### Grid view

Each tile represents one Holding, not one card identity. It exposes the same
properties and actions as the corresponding list row, with artwork given more
space. Switching views does not change the result set or lose route state.

### Add form

Visible Search results and visible card details expose "Add to collection."
Search opens the form after loading the selected printing details. The modal
does not navigate away from the current page.

The form contains:

- Exact printing, shown but not editable.
- Quantity, defaulting to 1.
- Language, defaulting to the selected printing's language when available.
- Finish, preselected only when the printing has exactly one finish.
- Condition, with no automatic default.

Ambiguous finish, missing language, and condition require an explicit choice.
Save keeps the user on the current page and confirms the new Collection total
for that Holding.

Protected results do not expose Add until the user reveals the printing.
Digital printings never expose Add.

### Edit and remove

Edit uses the same property controls as Add. The exact printing is fixed. The
form explains that matching another Holding will merge them before the user
saves.

Remove names the visible card and Holding properties in its confirmation. An
unavailable row uses its generic label and user-owned properties. A protected
row must be revealed before it can be edited or removed.

### Empty and error states

An empty Collection links to Search with "Find cards to add." A filter with no
matches offers to clear the current search and filters without implying that
the Collection is empty.

A read error preserves route state and offers Retry. An artwork error uses the
existing image placeholder and does not remove the rest of the row.

## Backup behavior

Workspace backup version 3 reads complete Collection lots from materialized
LiveStore state. It retains stable lot IDs and every optional metadata field.

Import validates the complete file, creates a new unbound Workspace, commits
ordinary versioned events, and verifies the resulting materialized state before
activation. An invalid, interrupted, or failed restore leaves the previously
active Workspace untouched. Optional Account synchronization uses the same
collection events and is not part of the backup format.

## Future binders

A binder will be a storage location. Assigning an entire lot changes its
`location_id`. Moving only some copies creates a new lot for the moved quantity
and reduces the source lot in the same transaction.

The Holding query still groups by printing, finish, language, and condition, so
the Collection page continues to show the total across every binder and box. A
later Holding detail can expose the lot breakdown. Binder pages and slots can be
added beside storage locations when their product behavior is known.

## Implemented boundaries

- `@mooligan/workspace` owns versioned events and materializers.
- Renderer Collection mutations validate catalog facts and commit those events.
- Electron main owns the session-bound disposable projection.
- The catalog worker owns spoiler-safe Holding reads and never opens LiveStore.
- Backup version 3 exports materialized state and restores through events.
- The Cloudflare Durable Object stores authorized event logs for optional sync.

## Acceptance scenarios

The first version is complete when automated tests and a manual desktop pass
cover these scenarios:

1. Adding one visible paper printing creates one unattributed lot and one
   Holding.
2. Adding the same printing, finish, language, and condition increments the
   existing lot without changing its ID.
3. Changing any Holding-key property creates a separate Holding unless it
   collides with an existing one.
4. A colliding edit merges atomically and preserves the target lot ID.
5. Digital printings, unsupported finishes, unknown languages, invalid
   conditions, and nonpositive quantities are rejected without a partial write.
6. Tokens, emblems, art cards, and other non-digital catalog records can be
   added.
7. Name search, each filter, combined filters, all sorts, stable pagination, and
   totals produce the documented result.
8. List and grid show one item per Holding and preserve route and view state.
9. Protecting an owned preview removes all card and printing facts from its row
   and visible totals while preserving its protected copy quantity.
10. Revealing that preview restores the normal Holding without changing stored
    ownership.
11. Removing a catalog printing produces an editable "Unavailable printing"
    row and leaves its lot in backups.
12. Switching workspaces cannot return Holdings from the previous workspace.
13. Backup export and import preserve stable IDs, optional metadata, and
    unattributed-lot uniqueness.
14. Add, edit, and remove all work while the network is unavailable.

## Main implementation files

- `packages/domain/src/catalog.ts`
- `packages/domain/src/collection.ts`
- `packages/domain/src/catalog-detail.ts`
- `apps/desktop/electron/workspace/backup.ts`
- `apps/desktop/electron/collection/projection.ts`
- `apps/desktop/electron/collection/projection-ipc.ts`
- `apps/desktop/electron/catalog/query.ts`
- `apps/desktop/electron/catalog/query-worker.ts`
- `apps/desktop/electron/catalog/ipc.ts`
- `apps/desktop/src/features/collection/collection-mutations.ts`
- `apps/desktop/src/features/workspace/collection-projection.tsx`
- `apps/desktop/src/features/workspace/workspace-backup.ts`
- `packages/workspace/src/schema.ts`
- `apps/desktop/src/routes/collection.tsx`

Do not add an ORM, a second collection database, a separate Holdings table, or
a generic repository layer for this work. LiveStore, the existing catalog
SQLite database, Zod, IPC, TanStack Router, Base UI, StyleX, and the current test
setup cover the required boundaries.
