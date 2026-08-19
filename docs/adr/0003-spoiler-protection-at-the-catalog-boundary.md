# ADR 0003: Spoiler Protection at the Catalog Boundary

Status: accepted

Date: 2026-08-19

## Context

Mooligan's local Scryfall catalog contains announced printings before their
release dates. Those records can expose card names, artwork, rules text,
printing treatments, prices, and derived deck characteristics through search,
card details, sibling galleries, image requests, collections, decks, or lists.

A renderer-only blur or placeholder is insufficient. The current unique-card
search selects the newest printing before returning one representative, so an
unreleased reprint can replace an otherwise safe released result. A direct
printing route or image protocol request can also bypass a component-level
filter.

Mooligan is local-first. Spoiler protection must work without an account or
network connection, survive catalog replacement, and later synchronize as
user-owned workspace state. Revealing one item must not silently widen consent,
while release-family reveals must continue to cover subsets added by later
catalog updates.

Scryfall provides release dates on card records and parent-set relationships on
set records. Its set object defines `parent_set_code` for associated sets such
as promos and tokens:
<https://github.com/scryfall/api-types/blob/main/src/objects/Set/Set.ts>.

## Decision

### Protection is derived per printing

A printing is a preview while its effective release date is later than the
user's current local calendar date. Use the printing release date first and
the containing set's release date only when the printing date is absent. A
record with neither date is not classified as a preview.

Preview status is derived during reads and is never persisted as an `isSpoiler`
flag. Protection ends automatically at local midnight on the release date,
including while Mooligan remains open.

An unreleased reprint does not make its shared card identity a spoiler. Released
printings and the card information reachable through them remain visible. Only
the preview printing and information reached exclusively through it are
protected.

### Protection is the default workspace policy

Every workspace starts with spoiler protection enabled. The effective
visibility of a preview printing is determined by the following ordered rules:

1. Released printings are visible.
2. “Always show previews” makes every preview visible.
3. A reveal for the printing's release family makes it visible.
4. A reveal for the exact printing makes it visible.
5. Otherwise the preview remains protected.

Reveals are durable across navigation, restarts, catalog replacements, backups,
and—when an account is connected—workspace synchronization. Reveal targets use
stable catalog IDs, not names or mutable dates.

A printing reveal exposes only that exact printing. A release reveal resolves
the selected set to the root of its parent-set graph and exposes the root plus
all current and future descendants. Entering through a subset therefore has the
same scope as entering through the root.

Broader consent takes precedence during ordinary use. A printing cannot be
re-protected while its release family is revealed, and a release cannot be
re-protected while “Always show previews” is enabled. The UI must explain the
broader decision that needs to be revoked first.

### Catalog reads enforce effective visibility

The Electron main process combines the active workspace's spoiler state with
the local date and passes a trusted visibility snapshot to catalog queries. The
renderer cannot request `includeSpoilers`, provide its own date, or otherwise
bypass the policy.

Enforcement occurs before data crosses the catalog boundary:

- Browse and search omit protected printings entirely.
- Unique-card queries filter protected printings before choosing the newest
  representative.
- Search totals and pagination describe visible results only.
- A direct protected-printing route returns a narrow protected result containing
  only the release-family identity and selected printing's release date needed
  for the gate.
- Visible card details omit protected sibling printings.
- Card-image source resolution refuses protected printing images even when the
  bytes already exist in the device-local cache.
- Upcoming-set queries expose only root release-family name, code, symbol, and
  the next future release date within that family before consent.

Search may display a static “Spoiler protection on” status while previews exist
in the catalog. It must not reveal whether protected cards match the current
query, nor show names, placeholders, counts, or preview progress in results.

### Reveal is explicit and reversible

The protected card route is itself the confirmation surface. “Reveal this
printing” acts immediately without a second modal or hold gesture. “Reveal this
release” is a secondary action and states that associated subsets are included.

The inverse actions are “Protect this printing” and “Protect this release.”
Settings also provides “Protect all previews,” which enables protection and
invalidates all narrower reveal exceptions. Turning off “Always show previews”
without using the reset action restores the previously established printing
and release reveals.

The interface uses “Spoiler protection,” “protected preview,” “Reveal this
printing,” and “Reveal this release.” It does not blur artwork because a blur
still leaks visual information.

### User-owned content is preserved but gated

Collection, deck, and list records continue to retain exact card identifiers
when they reference protected previews. Only affected rows are gated. A gated
row may expose its quantity and a generic protected-preview label, but not its
card identity, artwork, mana cost, type, rules text, legality, price, or derived
analytics. Protected characteristics are excluded from visible totals and
charts and summarized only as a protected quantity.

Exports and shares preserve the real identifiers so the artifact remains
valid. The exporting UI reveals only that protected previews are present, and
each recipient applies their own spoiler decisions when opening shared content.

### Synchronization is protection-biased

Spoiler policy and reveal decisions remain fully functional in a local
workspace. Optional account synchronization carries them to other devices.

When the service can establish a valid order, the latest decision wins. A
concurrent or ambiguous reveal-versus-protect conflict resolves to protection.
Re-protection is synchronized as an explicit tombstone rather than inferred
from a missing reveal. “Protect all previews” advances a reset generation so a
stale offline device cannot restore exceptions from an older generation.

## Consequences

- Catalog installation must import validated set metadata and resolve an
  acyclic release-family graph alongside card records.
- Spoiler decisions live in the durable workspace, separate from the
  replaceable catalog database.
- Catalog list, detail, sibling, set, and image-source operations share one
  visibility rule and require tests proving that no renderer input bypasses it.
- The card-detail contract becomes a visible/protected result rather than
  returning full details for every valid printing ID.
- The Sets page becomes the intentional discovery surface for upcoming release
  families; ordinary search remains spoiler-safe.
- Re-protecting content does not need to delete cached image bytes. The image
  protocol still refuses them while protection is effective.
- Spoiler protection does not defend against a user inspecting the raw local
  catalog database or cache outside Mooligan. It prevents accidental disclosure
  through product surfaces.
