import type { Deck, DeckEntry } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { Menu } from "@base-ui/react/menu";
import { useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { useCatalogImageLoading } from "../catalog/catalog-image-loading";
import { DeckCardPicker } from "./deck-card-picker";
import { deckStyles } from "./deck-controls";
import { DeckCardItem } from "./deck-card-item";
import "./deck-cards.css";
import { summarizeDeck } from "@mooligan/workspace/client/deck-summary";
import {
  cardIdentity,
  tagsForDeck,
  indexCardTags,
  groupEntriesByTag,
} from "@mooligan/workspace/client/tag-state";
import { CardTagBadge, tagStyles } from "./card-tag-controls";
import { CardTagEditor } from "./card-tag-editor";
import { CardTagManager } from "./card-tag-manager";
import { useCardTags } from "./use-card-tags";
import { useViewPreference } from "../preferences/use-view-preference";

export function DeckCards({
  deck,
  printings,
  onEdit,
  onRemove,
}: {
  deck: Deck;
  printings: ReadonlyMap<string, CatalogPrintingResult | null>;
  onEdit: (entry: DeckEntry) => void;
  onRemove: (entry: DeckEntry) => void;
}) {
  const { view, setView } = useViewPreference("mooligan.deck.view");
  const visual = view !== "list";
  const { tags, assignments } = useCardTags();
  const [groupBy, setGroupBy] = useState("type");
  const [filter, setFilter] = useState("all");
  const [includeGlobal, setIncludeGlobal] = useState(true);
  const [managing, setManaging] = useState(false);
  const [tagging, setTagging] = useState<{ cardIds: string[]; title: string } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const available = tagsForDeck(tags, deck.id, includeGlobal);
  const byCard = indexCardTags(available, assignments);
  const activeFilter =
    filter === "untagged" || available.some(({ id }) => id === filter) ? filter : "all";
  const filtered = deck.entries.filter((entry) => {
    const identity = cardIdentity(printings.get(entry.printingId));
    const assigned = identity ? (byCard.get(identity) ?? []) : [];
    return (
      activeFilter === "all" ||
      (activeFilter === "untagged"
        ? !assigned.length
        : assigned.some(({ id }) => id === activeFilter))
    );
  });
  const summary = summarizeDeck(filtered, [], printings);
  const allIds = new Set(
    deck.entries.flatMap((entry) => cardIdentity(printings.get(entry.printingId)) ?? []),
  );
  const selectedIds = [...selection].filter((id) => allIds.has(id));
  const visibleIds = new Set(
    filtered.flatMap((entry) => cardIdentity(printings.get(entry.printingId)) ?? []),
  );
  function selectCard(id: string, checked: boolean) {
    setSelection((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  const containerRef = useRef<HTMLDivElement>(null);
  const images = useMemo(
    () =>
      new Map(
        [...printings].map(([id, printing]) => [
          id,
          printing?.status === "visible"
            ? printing.detail.selectedPrinting.images.find(
                (image) => image.faceIndex === 0 && image.size === "normal",
              )
            : undefined,
        ]),
      ),
    [printings],
  );
  const imageIds = useMemo(
    () => [...images].flatMap(([id, image]) => (image ? [id] : [])),
    [images],
  );
  const imageLoading = useCatalogImageLoading(containerRef, imageIds, visual, visual, "240px 0px");

  return (
    <div ref={containerRef} data-deck-view={view} {...stylex.props(styles.sections)}>
      <div {...stylex.props(styles.toolbar)}>
        {selectedIds.length ? (
          <div {...stylex.props(styles.selection)}>
            <span role="status" {...stylex.props(styles.selectionCount)}>
              {selectedIds.length} selected
            </span>
            <Button
              size="sm"
              onClick={() =>
                setTagging({
                  cardIds: selectedIds,
                  title: `Tag ${selectedIds.length} selected cards`,
                })
              }
            >
              Tag
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={[...visibleIds].every((id) => selection.has(id))}
              onClick={() => setSelection(new Set([...selection, ...visibleIds]))}
            >
              Select all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          <DeckCardPicker deckId={deck.id} />
        )}
        <div {...stylex.props(styles.spacer)} />
        <Menu.Root>
          <Menu.Trigger render={<Button size="sm" variant="ghost" />}>
            {activeFilter === "all"
              ? groupBy === "tags"
                ? "Grouped by tag"
                : "Display"
              : activeFilter === "untagged"
                ? "Untagged cards"
                : (available.find(({ id }) => id === activeFilter)?.name ?? "Display")}
            <span aria-hidden="true" {...stylex.props(styles.caret)}>
              ▾
            </span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={6} className="deck-card-popup-positioner">
              <Menu.Popup className="deck-card-menu">
                <Menu.Group>
                  <Menu.GroupLabel className="deck-card-menu-label">Group by</Menu.GroupLabel>
                  <Menu.RadioGroup value={groupBy} onValueChange={setGroupBy}>
                    <MenuRadio value="type">Card type</MenuRadio>
                    <MenuRadio value="tags">Tags & categories</MenuRadio>
                  </Menu.RadioGroup>
                </Menu.Group>
                <Menu.Separator className="deck-card-menu-separator" />
                <Menu.Group>
                  <Menu.GroupLabel className="deck-card-menu-label">Show</Menu.GroupLabel>
                  <Menu.RadioGroup value={activeFilter} onValueChange={setFilter}>
                    <MenuRadio value="all">All cards</MenuRadio>
                    <MenuRadio value="untagged">Untagged</MenuRadio>
                    {available.map((tag) => (
                      <MenuRadio key={tag.id} value={tag.id}>
                        {tag.name}
                        {tag.deckId === null ? (
                          <span {...stylex.props(tagStyles.scope)}>Global</span>
                        ) : null}
                      </MenuRadio>
                    ))}
                  </Menu.RadioGroup>
                  <Menu.CheckboxItem
                    checked={includeGlobal}
                    onCheckedChange={setIncludeGlobal}
                    closeOnClick={false}
                    className="deck-card-menu-item deck-card-menu-choice"
                  >
                    <Menu.CheckboxItemIndicator className="deck-card-menu-check" keepMounted>
                      ✓
                    </Menu.CheckboxItemIndicator>
                    Include global tags
                  </Menu.CheckboxItem>
                </Menu.Group>
                <Menu.Separator className="deck-card-menu-separator" />
                <Menu.Item
                  disabled={!visibleIds.size}
                  onClick={() => setSelection(new Set([...selection, ...visibleIds]))}
                  className="deck-card-menu-item"
                >
                  Select shown cards
                </Menu.Item>
                <Menu.Item onClick={() => setManaging(true)} className="deck-card-menu-item">
                  Manage tags…
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <ToggleGroup
          aria-label="Deck card view"
          value={[view]}
          variant="outline"
          spacing={0}
          size="sm"
          onValueChange={(nextViews) => {
            const nextView = nextViews[0];
            if (nextView) setView(nextView);
          }}
        >
          <ToggleGroupItem value="list" type="button">
            List
          </ToggleGroupItem>
          <ToggleGroupItem value="stack" type="button">
            Stack
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" type="button">
            Grid
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {groupBy === "tags" ? (
        <p {...stylex.props(tagStyles.caption)}>
          Cards appear in each assigned category. Deck totals count each copy once.
        </p>
      ) : null}
      {!deck.entries.length ? (
        <p {...stylex.props(deckStyles.muted)}>No cards yet. Add cards to start building.</p>
      ) : !filtered.length ? (
        <p {...stylex.props(deckStyles.muted)}>No cards match this filter.</p>
      ) : null}
      {summary.sections
        .filter(({ quantity }) => quantity > 0)
        .map(({ value, label, quantity, entries }) => (
          <section key={value} {...stylex.props(styles.section)} aria-label={label}>
            <h2 {...stylex.props(styles.sectionTitle)}>
              {label} <span {...stylex.props(styles.typeCount)}>{quantity}</span>
            </h2>
            <div className="deck-card-groups">
              {(groupBy === "tags"
                ? groupEntriesByTag(entries, printings, available, assignments)
                    .filter((group) => value === "mainboard" || group.quantity > 0)
                    .map((group) => ({ ...group, type: group.tag?.name ?? "Untagged" }))
                : (value === "mainboard"
                    ? summary.mainboardGroups
                    : [{ type: "", entries, quantity }]
                  ).map((group) => ({ ...group, id: group.type, tag: null }))
              ).map((group) => (
                <div key={group.id} className="deck-card-group">
                  {group.type ? (
                    <h3 {...stylex.props(styles.typeTitle)}>
                      {group.tag ? <CardTagBadge tag={group.tag} /> : group.type}{" "}
                      <span {...stylex.props(styles.typeCount)}>{group.quantity}</span>
                    </h3>
                  ) : null}
                  {!group.quantity && groupBy === "tags" ? (
                    <p {...stylex.props(tagStyles.caption)}>No cards assigned.</p>
                  ) : null}
                  <ul className="deck-card-items">
                    {group.entries
                      .toSorted((a, b) => {
                        const left = printings.get(a.printingId);
                        const right = printings.get(b.printingId);
                        return (
                          (left?.status === "visible" ? left.detail.card.name : "").localeCompare(
                            right?.status === "visible" ? right.detail.card.name : "",
                          ) || a.id.localeCompare(b.id)
                        );
                      })
                      .map((entry) => {
                        const printing = printings.get(entry.printingId);
                        const identity = cardIdentity(printing);
                        return (
                          <DeckCardItem
                            key={entry.id}
                            deck={deck}
                            entry={entry}
                            printing={printing}
                            view={view}
                            image={images.get(entry.printingId)}
                            imageActive={imageLoading.ids.has(entry.printingId)}
                            imageFailed={imageLoading.failed.has(entry.printingId)}
                            imageKey={`${imageLoading.generation}:${entry.printingId}`}
                            onImageError={() => imageLoading.settle(entry.printingId, true)}
                            onImageLoad={() => imageLoading.settle(entry.printingId)}
                            tags={identity ? (byCard.get(identity) ?? []) : []}
                            selected={identity !== null && selection.has(identity)}
                            onSelect={
                              identity ? (checked) => selectCard(identity, checked) : undefined
                            }
                            onTag={
                              identity
                                ? () => setTagging({ cardIds: [identity], title: "Edit card tags" })
                                : undefined
                            }
                            onEdit={() => onEdit(entry)}
                            onRemove={() => onRemove(entry)}
                          />
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      {managing ? <CardTagManager deckId={deck.id} onClose={() => setManaging(false)} /> : null}
      {tagging ? (
        <CardTagEditor
          deckId={deck.id}
          cardIds={tagging.cardIds}
          title={tagging.title}
          onClose={() => setTagging(null)}
        />
      ) : null}
    </div>
  );
}

function MenuRadio({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Menu.RadioItem
      value={value}
      closeOnClick
      className="deck-card-menu-item deck-card-menu-choice"
    >
      <Menu.RadioItemIndicator className="deck-card-menu-check" keepMounted>
        ✓
      </Menu.RadioItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

const styles = stylex.create({
  sections: { display: "grid", gap: "28px", minWidth: 0 },
  section: { display: "grid", gap: "12px", minWidth: 0 },
  sectionTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    margin: 0,
    fontSize: "15px",
    fontWeight: 500,
  },
  typeTitle: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
    margin: 0,
    marginBottom: "4px",
    paddingInline: "4px",
    color: "#a6a89d",
    fontSize: "12px",
    fontWeight: 500,
  },
  typeCount: { color: "#6f7268", fontWeight: 400, fontVariantNumeric: "tabular-nums" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    minHeight: "32px",
  },
  spacer: { flex: 1 },
  selection: { display: "flex", alignItems: "center", gap: "4px" },
  selectionCount: { marginInlineEnd: "8px", fontVariantNumeric: "tabular-nums" },
  caret: { color: "#a6a89d", fontSize: "10px" },
});
