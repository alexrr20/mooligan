# ADR 0001: Card Detail Identity and Routing

Status: accepted

Date: 2026-08-14

## Context

Mooligan distinguishes a card's shared rules identity from its individual
printings. Rules text, faces, color identity, legalities, and rulings belong to
the card. Artwork, set, collector number, language, finishes, and ownership or
deck actions belong to an exact printing.

Search currently returns printings. Collection lots and deck entries also
reference exact printing IDs. Some catalog records do not have an Oracle ID, so
the shared rules identity is not a universal navigation key.

The card detail experience needs to preserve both concepts without presenting
separate, disconnected card and printing pages.

## Decision

Mooligan will provide one card-centered detail experience with an explicit
selected printing.

The route will use the selected printing's catalog ID:

```text
/cards/$printingId
```

Opening a search result selects that result's printing. Switching to a sibling
printing navigates to that printing's route, so every selectable printing is
directly linkable and survives refresh, history navigation, and future sharing.

The page will load the selected printing first and then group other printings
by the selected record's shared rules identity when one exists. Records without
a shared rules identity remain valid detail pages but have no sibling-printing
group.

The page will present card-level information once and printing-level
information in the context of the selected printing. Any action whose result
depends on edition, finish, or language must operate on the selected printing,
never on an implicit representative printing.

## Consequences

- Search, collection, deck, and list surfaces can link to the same route using
  the printing IDs they already hold.
- The browser history records printing changes, and copied links reproduce the
  same selection.
- The catalog query boundary needs a detail operation that returns the selected
  printing, its card-level data, and its sibling printings.
- The UI must distinguish card-level facts from selected-printing facts.
- The route does not require an Oracle ID and therefore supports unusual
  catalog records such as tokens, art cards, or other records without one.
- A later public sharing URL may use a different external identifier without
  changing the local desktop route.
