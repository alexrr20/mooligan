# Mooligan

Mooligan models Magic: The Gathering cards, a user's owned paper collection,
and decks they plan to play.

## Language

**Card**:
A rules identity shared by corresponding printings. A catalog record without a
shared rules identity counts as its own card.

**Printing**:
One exact edition of a card, identified by its catalog printing ID. A printing
may be physical or digital, but only paper printings can belong to a collection.

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
