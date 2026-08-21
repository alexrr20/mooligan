# Collection v1

Status: ready for implementation

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

## Current foundation

The repository already has the pieces needed for this work:

- `/collection` exists as a placeholder route.
- `CollectionLot` already retains printing, finish, language, condition,
  quantity, acquisition time, unit cost, location, and notes.
- Workspace backups already serialize collection lots as domain objects.
- The catalog detail contract exposes paper status, language, and available
  finishes for the selected printing.
- The catalog query worker already owns spoiler-safe catalog reads.
- Workspace switching already exposes the active workspace database path and
  serializes mutations against the selected workspace.

The current `collection_lots` table is only an early persistence stub. It stores
an ID and a JSON payload and exposes generic put and read methods. Collection v1
replaces that table with the normalized schema below and removes the generic
collection entity path.

There will be no dual-read path or conversion code for the early payload table.
Development workspace databases created with that table must be reset when the
normalized schema lands. The workspace backup shape does not change because it
already represents lots rather than database rows.

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

Collection v1 does not include:

- Digital cards.
- Multiple collections inside one workspace.
- Collection ownership derived from decks or reserved by decks.
- Bulk selection or bulk editing.
- A UI for acquisition date, cost, storage location, or notes.
- Binder, page, slot, or card-position management.
- Collection import or export outside the existing workspace backup.
- Collection cloud synchronization.
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

`collection_lots` uses ordinary SQLite columns:

| Column                   | Storage   | Rule                                                                               |
| ------------------------ | --------- | ---------------------------------------------------------------------------------- |
| `id`                     | `TEXT`    | Primary key containing a stable UUID                                               |
| `printing_id`            | `TEXT`    | Required exact catalog printing ID                                                 |
| `finish`                 | `TEXT`    | `nonfoil`, `foil`, `etched`, or `glossy`                                           |
| `language`               | `TEXT`    | Required known card-language code                                                  |
| `condition`              | `TEXT`    | `near-mint`, `lightly-played`, `moderately-played`, `heavily-played`, or `damaged` |
| `quantity`               | `INTEGER` | Greater than zero                                                                  |
| `acquired_at`            | `TEXT`    | Optional ISO 8601 timestamp                                                        |
| `unit_cost_amount_minor` | `INTEGER` | Optional nonnegative amount in minor currency units                                |
| `unit_cost_currency`     | `TEXT`    | Optional uppercase ISO 4217 code paired with the amount                            |
| `location_id`            | `TEXT`    | Optional future storage-location ID                                                |
| `notes`                  | `TEXT`    | Optional user notes                                                                |

The database repeats the enum, quantity, and paired-cost constraints. Empty
optional text becomes null before storage.

A partial unique index covers the Holding key when acquisition time, both cost
columns, location, and notes are null. This enforces one unattributed lot per
Holding even if two writes race. A second index starts with printing, finish,
language, and condition to support Holding aggregation.

There is no `workspace_id` column. Each workspace already owns a separate
database.

## Supported values

### Finish

The shared finish model adds `glossy` to the current `nonfoil`, `foil`, and
`etched` values. The catalog importer, catalog details, collection schemas, and
database checks use the same set.

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

The catalog query worker opens the catalog read-only and attaches the active
workspace database read-only. One SQL query performs:

- Lot grouping and quantity sums.
- Catalog enrichment.
- Spoiler enforcement.
- Name and property filtering.
- Sorting.
- Visible and protected totals.
- Pagination.

The worker receives trusted workspace and catalog paths when it starts. It
restarts when either path changes. A workspace switch must not allow an old
worker response to appear in the new workspace.

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

The preload exposes a narrow `collection` namespace. It provides list, add,
update, and remove operations. The renderer never receives a generic lot write
method or direct database access.

The Electron main process validates every request, binds it to the workspace
that was active when the operation began, and serializes writes through the
workspace mutation queue. Each mutation uses one SQLite transaction.

### Add

Add accepts a printing ID, finish, language, condition, and positive whole-number
quantity.

Before writing, the main process asks the catalog query worker for the trusted
facts needed to validate the printing. The printing must:

- Exist in the installed catalog.
- Be visible under the current spoiler policy.
- Be non-digital.
- List the requested finish as supported.

The language must belong to the known list but does not have to match the
catalog record. If catalog finish data is missing, the write fails because the
application cannot prove that the requested finish exists.

The transaction inserts a new unattributed lot with a random UUID. If the
partial unique index finds the same Holding key, it increments the existing
lot instead. The existing lot ID survives.

### Update

Update identifies the editable lot by its stable UUID and supplies a positive
quantity, finish, language, and condition. It cannot change the printing ID.

The mutation validates the target properties with the same rules as Add. If the
target key already has an unattributed lot, the target lot survives, its quantity
increases by the requested source quantity, and the source lot is deleted in the
same transaction. Otherwise the source lot keeps its UUID and receives the new
values.

An unavailable lot is the exception to catalog validation. Its update may
change quantity, language, and condition after applying the normal domain
checks. It must preserve printing ID and finish because the catalog cannot
validate a replacement finish.

Collection v1 never rewrites attributed lots. Product-created Holdings contain
one unattributed lot, so their edit action is available. If an imported backup
contains attributed lots, the Holding remains visible but read-only until a
later lot-management workflow can preserve those details during edits.

### Remove

Remove identifies the editable lot by its stable UUID. After a confirmation in
the renderer, the main process deletes its first-version unattributed lot in one
transaction. Quantity zero is not an update shortcut.

An attributed or otherwise read-only Holding cannot be removed through the v1
Holding action. Workspace backup import remains the only v1 operation that can
replace those lots.

### Failure behavior

A failed mutation changes nothing. The form stays open, keeps the entered
values, and shows a plain error message. Controls remain disabled while a write
is pending so a double action cannot submit twice.

After success, the renderer invalidates the current Collection query. The user
stays on the current Search, card detail, or Collection page and sees a brief
confirmation.

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

Workspace backup JSON continues to store complete `CollectionLot` objects. It
retains stable lot IDs and every optional metadata field. Normalized database
columns are mapped back to the existing domain object during export and rebuilt
from that object during import.

Backup import validates every lot before changing the workspace. It rejects
duplicate lot IDs and duplicate unattributed Holding keys. The replacement is
transactional.

Collection cloud sync stays out of this version. The stable lot IDs and lot-based
backup model leave room for a future synchronization contract without adding a
sync abstraction now.

## Future binders

A binder will be a storage location. Assigning an entire lot changes its
`location_id`. Moving only some copies creates a new lot for the moved quantity
and reduces the source lot in the same transaction.

The Holding query still groups by printing, finish, language, and condition, so
the Collection page continues to show the total across every binder and box. A
later Holding detail can expose the lot breakdown. Binder pages and slots can be
added beside storage locations when their product behavior is known.

## Delivery slices

Each slice ends with a working product path.

### Slice 1: own a card

- Add `glossy`, the known language schema, and collection request and response
  contracts to the shared domain package.
- Replace the payload table with normalized `collection_lots` columns and
  transaction-specific store methods.
- Attach the active workspace read-only in the catalog worker.
- Add the simplest name-sorted Collection query.
- Add from a visible card detail page and render the resulting list row.
- Keep workspace backups round-tripping every lot field.

### Slice 2: manage a Holding

- Add edit, merge, and remove mutations.
- Add confirmations, pending states, errors, and post-write query refresh.
- Cover missing catalog records and read-only attributed Holdings.

### Slice 3: browse a real Collection

- Add route-backed search and single-value filters.
- Add set and quantity sorting, stable tie breakers, totals, and batches of 100.
- Add empty, filtered-empty, loading, and retry states.
- Prove that protected content cannot cross the query boundary.

### Slice 4: finish the entry points

- Add the grid view and its Collection-specific local preference.
- Add the Search result action and compact add modal.
- Add exact-detail links with a return to the current Collection route.
- Finish keyboard, screen-reader, narrow-window, and reduced-motion behavior.

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

## Files expected to change during implementation

The exact split may move as the code takes shape, but the work should stay near
these existing boundaries:

- `packages/domain/src/catalog.ts`
- `packages/domain/src/collection.ts`
- `packages/domain/src/catalog-detail.ts`
- `apps/desktop/electron/workspace/store.ts`
- `apps/desktop/electron/workspace/backup.ts`
- `apps/desktop/electron/catalog/query.ts`
- `apps/desktop/electron/catalog/query-worker.ts`
- `apps/desktop/electron/catalog/ipc.ts`
- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/preload.ts`
- `apps/desktop/src/electron.d.ts`
- `apps/desktop/src/routes/collection.tsx`
- New focused files below `apps/desktop/src/features/collection/`
- Existing Search and card-detail components for their Add actions and return
  origins

Do not add an ORM, a second collection database, a separate Holdings table, or
a generic repository layer for this work. The existing SQLite, Zod, IPC, query
worker, TanStack Router, Base UI, StyleX, and test setup are enough.
