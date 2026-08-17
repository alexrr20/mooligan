# Mooligan Glossary

## Card

A rules identity shared by all corresponding printings. Card-level facts
include names and faces, rules text, color identity, mana value, keywords,
legalities, and rulings. A card will usually correspond to Scryfall's Oracle ID,
but some catalog records have no shared rules identity.

## Oracle text

A card or card face's current official rules text. Mooligan treats Oracle text
as card-level information. It is distinct from the wording physically printed
on an older edition, card-specific rulings, general game rules, and strategy
guidance.

## Oracle symbol

A recognized brace-delimited token embedded in mana costs or Oracle text, such
as `{W}`, `{T}`, or `{2/W}`. The UI may represent it with a familiar visual
symbol, but the canonical text token remains available for accessibility,
selection, copying, and fallback.

## Card face

One ordered face of a card. Each face can have its own name, mana cost, type
line, Oracle text, and stats. A multi-face card remains one card and one
printing; its faces do not receive independent routes or ownership records.

## Printing

A specific physical or digital edition of a card. A printing is identified by
its catalog printing ID and carries facts such as set, collector number,
artwork, rarity, language, artists, release date, and available finishes.

## Selected printing

The printing currently providing edition-specific context on a card detail
page. It is encoded in the `/cards/$printingId` route. Switching the selected
printing changes the URL.

## Sibling printing

Another printing with the same shared rules identity as the selected printing.
Catalog records without a shared rules identity have no sibling-printing group.

## Card detail page

The card-centered detail experience reached through a selected printing. It
presents shared card information once, presents edition-specific information
for the selected printing, and ensures printing-sensitive actions use that
selection explicitly.

## Catalog image cache

The bounded, device-local store of artwork fetched for catalog printings that a
user has viewed. It is replaceable application data, not part of the user's
workspace, backups, or synchronization. An image's absence never makes its
card record unavailable.
