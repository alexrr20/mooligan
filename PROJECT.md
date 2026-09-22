# Mooligan product context

Mooligan is a desktop and mobile app for managing Magic: The Gathering cards, decks, and
collections. The current implementation is an early foundation, not the limit
of the intended product.

## Product direction

Mooligan should make it easy to:

- Find and inspect MTG cards.
- Track a personal card collection.
- Build, organize, and manage decks.
- Use the core product locally without an internet connection or an account.
- Optionally sign in to sync data across devices and share selected
  content with friends.

This describes the product direction rather than a committed feature roadmap.

## Domain language

### Workspace and identity

**Workspace**:
The personal data boundary containing one Collection, its Decks and card lists,
and durable user decisions such as spoiler reveals and price provider preferences. A Workspace exists without
an Account, may later bind to one Account, and may be available on several
Devices.
_Avoid_: Account

**Device**:
One installation of Mooligan with its own local files, caches, device-specific
settings, and stable synchronization client identity. A Device may hold several
Workspaces, but it is not itself a Workspace or Account.
_Avoid_: Workspace, Account

**Account**:
An optional online identity used to synchronize one personal Workspace across
Devices and publish selected content. An Account is not required to create,
open, or edit a Workspace.
_Avoid_: Workspace

**Unbound workspace**:
A Workspace with no Account association. It remains a complete local Workspace
and may later bind to one Account.
_Avoid_: Anonymous account

**Shared artifact**:
A read-only Deck or card list published by its owner. Opening a Shared artifact
does not add it to the recipient's personal Workspace.
_Avoid_: Shared workspace

### Cards

**Card**:
A rules identity shared by corresponding printings. A catalog record without a
shared rules identity counts as its own card.

**Oracle text**:
A card or card face's current official rules text. It is distinct from wording
printed on an older edition, rulings, general game rules, and strategy guidance.

**Oracle symbol**:
A recognized brace-delimited token in a mana cost or Oracle text, such as
`{W}`, `{T}`, or `{2/W}`.

**Card face**:
One ordered face of a card, with its own name, mana cost, type line, Oracle text,
and stats. A multi-face card still has one card identity and one printing identity.

**Printing**:
One exact edition of a card, identified by its catalog printing ID. A printing
may be physical or digital, but only paper printings can belong to a collection.

**Selected printing**:
The printing chosen to provide edition-specific context for a card.

**Sibling printing**:
Another printing with the same shared rules identity as the selected printing.
A card without a shared rules identity has no sibling printings.

### Preview visibility

**Preview printing**:
A printing whose effective release date is later than the user's current local
date.

**Spoiler protection**:
The workspace policy that conceals preview printings until their release date
unless the user has revealed them.

**Protected preview**:
A preview printing that remains concealed under the workspace's current spoiler
policy. User-owned copies remain recorded without exposing the card's identity.

**Reveal**:
A durable workspace decision that removes spoiler protection from one exact
printing or one release family.

**Release family**:
A root set and every set connected beneath it through parent-set relationships,
including associated promos, tokens, Commander products, and other subsets.

### Collection and decks

**Collection**:
The single set of paper card copies a user owns in one workspace. It may contain
any paper printing in the catalog, and ownership is independent of whether a
deck references those cards.
_Avoid_: Inventory

**Holding**:
The total quantity of one exact printing whose copies share the same finish,
card language, and card condition. A holding may contain several collection
lots with different acquisition details or storage locations.
_Avoid_: Collection entry

**Collection lot**:
A positive quantity within one holding whose copies share acquisition details,
a current storage location, and notes. Moving only part of a lot splits it.
_Avoid_: Holding

**Unattributed collection lot**:
A collection lot without acquisition details, cost, storage location, or notes.
_Avoid_: Holding

**Storage location**:
A named physical place containing collection lots, such as a binder or card
box. One holding may span several storage locations.
_Avoid_: Collection

**Card condition**:
The physical wear of copies in a holding: Near Mint, Lightly Played, Moderately
Played, Heavily Played, or Damaged.
_Avoid_: Grade

**Card language**:
The known Magic language printed on every copy in a holding.
_Avoid_: Locale

**Deck**:
A planned arrangement of cards for play. A deck does not consume, reserve, or
move copies from the collection.

**Deck label**:
A label attached to a whole Deck for finding and organizing Decks, such as a
strategy or theme. It does not classify the Cards inside the Deck.

**Card tag**:
A named, colored role assigned to a Card. A Card can have several tags, and its
tags apply to all of its Printings within the tag's scope.

**Deck category**:
A Card tag scoped to one Deck. Grouping a Deck by tags shows Cards in every
assigned category, while Deck totals count each copy once.

**Global card tag**:
A Card tag scoped to the Workspace. Its assignments follow Cards into every
Deck, including Decks created later.

**Category template**:
A reusable set of Deck category names and colors. Applying a template adds
missing categories without replacing existing categories or assigning Cards.

### Pricing

**Market price**:
A dated reference value for one exact Printing and finish at a named market,
in a stated currency. It does not describe the acquisition cost of a Collection
lot or automatically account for a Holding's condition and language.

**Retail price**:
A market's reference value for buying a card.

**Buylist price**:
A market's reference value for selling a card to that market.

**Price supplier**:
The source that delivers market prices to Mooligan. A supplier can aggregate
prices from several markets; the supplier and market remain distinct.

## Product principles

### Local and offline first

Both apps' core card, collection, and deck workflows must work without
an account or a continuous network connection. User-owned data should remain
available locally. Network services may update reference data or add optional
capabilities, but should not become a prerequisite for normal use.

### Accounts are optional

Users should be able to start and continue using Mooligan without signing in.
An account exists for features that inherently need a service, principally
cross-device sync and sharing with friends.

### Cloud features enhance the local product

Sync and sharing must be layered on top of a complete local experience. A
service outage or missing login should not prevent users from viewing or
editing their local cards, decks, and collection.

### Keep desktop and mobile aligned

Desktop and mobile should share domain concepts, Workspace events, and feature
behavior. Adapt navigation and controls to each Device while keeping core
workflows available locally. Add capabilities when their requirements are known.

## Decision guidance

When evaluating product or architecture choices:

1. Optimize for the intended card, deck, and collection management experience,
   not only for the features that happen to exist today.
2. Prefer local storage and local execution for core workflows.
3. Keep authentication, sharing, and synchronization outside the critical path
   of offline use.
4. Preserve clear, reusable domain concepts where that supports both desktop
   and mobile, without adding abstractions solely for possible
   future needs.

## Non-goals

- Requiring an account for core functionality.
- Turning the desktop app into a thin client that depends on a remote backend.
- Requiring continuous connectivity to access user-owned data.
- Treating the current barebones interface or feature set as the finished
  product definition.

## Current state

The repository contains Electron desktop and Expo mobile apps, a Cloudflare
API, shared domain types, shared offline catalog and price logic, and a synced
LiveStore Workspace. Mobile and desktop share Collection and Deck editing,
spoiler decisions, Profile choices, and Workspace backup contracts. See `README.md` for current setup and implementation details.
