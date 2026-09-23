import { EditorSelect, EditorMessage, editorStyles } from "../../components/ui/editor-controls";
import { PrintingPrice } from "../prices/printing-price";
import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import type { DeckSection } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { listCatalog } from "../catalog/catalog-request";
import { useCatalogCardDetail } from "../cards/use-card-detail";
import { DeckQuantity, deckSectionOptions, deckStyles } from "./deck-controls";
import { useDeckMutations, useDecks } from "./use-decks";

export function DeckCardPicker({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Add cards
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={editorStyles.dialog}>
          <DialogTitle>Add cards</DialogTitle>
          <DialogDescription>Search by name or query, then choose a printing.</DialogDescription>
          <DeckCardSearch onSelect={setSelected} />
          {selected ? (
            <SelectedCardDialog
              printingId={selected}
              deckId={deckId}
              onClose={() => setSelected(undefined)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeckCardSearch({
  onSelect,
  actionLabel = "Add",
  disabled = false,
}: {
  onSelect: (printingId: string) => void;
  actionLabel?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState({ query: "", offset: 0 });
  const results = useQuery({
    queryKey: ["catalog", "deck-search", search],
    queryFn: ({ signal }) => listCatalog({ ...search, limit: 30, includeDigital: true }, signal),
    enabled: !!search.query,
  });
  return (
    <section {...stylex.props(deckStyles.section)} aria-label="Add cards">
      <div {...stylex.props(editorStyles.toolbar)}>
        <label {...stylex.props(editorStyles.field, deckStyles.grow)}>
          <Input
            aria-label="Search cards"
            value={input}
            maxLength={500}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                setSearch({ query: input.trim(), offset: 0 });
              }
            }}
            onValueChange={setInput}
            placeholder="Name or query, such as t:creature c:green"
          />
        </label>
        <Button
          type="button"
          disabled={disabled || !input.trim()}
          onClick={() => setSearch({ query: input.trim(), offset: 0 })}
        >
          Search
        </Button>
      </div>
      {results.isFetching ? <EditorMessage>Searching…</EditorMessage> : null}
      {results.error || results.data?.queryError ? (
        <EditorMessage error>{results.error?.message ?? results.data?.queryError}</EditorMessage>
      ) : null}
      {search.query && results.data && !results.data.cards.length && !results.data.queryError ? (
        <EditorMessage>No visible cards match this search.</EditorMessage>
      ) : null}
      <ul {...stylex.props(deckStyles.list)}>
        {results.data?.cards.map((card) => (
          <li key={card.id} {...stylex.props(deckStyles.row)}>
            <div {...stylex.props(deckStyles.grow)}>
              <strong>{card.name}</strong>
              <p {...stylex.props(editorStyles.muted)}>
                {card.setName} · {card.setCode.toUpperCase()} {card.collectorNumber}
                {card.isDigital ? " · Digital" : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              type="button"
              disabled={disabled}
              onClick={() => onSelect(card.id)}
              aria-label={`${actionLabel} ${card.name} from ${card.setCode} ${card.collectorNumber}`}
            >
              {actionLabel}
            </Button>
          </li>
        ))}
      </ul>
      {search.offset > 0 || results.data?.hasMore ? (
        <div {...stylex.props(editorStyles.toolbar)}>
          <Button
            type="button"
            disabled={disabled || search.offset === 0 || results.isFetching}
            variant="secondary"
            onClick={() => setSearch({ ...search, offset: Math.max(0, search.offset - 30) })}
          >
            Previous
          </Button>
          <Button
            type="button"
            disabled={disabled || !results.data?.hasMore || results.isFetching}
            variant="secondary"
            onClick={() => setSearch({ ...search, offset: search.offset + 30 })}
          >
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function SelectedCardDialog({
  printingId,
  deckId,
  onClose,
}: {
  printingId: string;
  deckId: string;
  onClose: () => void;
}) {
  const card = useCatalogCardDetail(printingId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent style={editorStyles.dialog}>
        <DialogTitle>Add card to deck</DialogTitle>
        <DialogDescription>Choose the quantity, finish, and section.</DialogDescription>
        {card.result?.status === "visible" ? (
          <AddDeckCardForm detail={card.result.detail} deckId={deckId} onAdded={onClose} />
        ) : (
          <EditorMessage error={!card.loading}>
            {card.loading
              ? "Reading printing…"
              : card.error || "This printing is unavailable or protected."}
          </EditorMessage>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddToDeckButton({ detail }: { detail: CatalogCardDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add to deck
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={editorStyles.dialog}>
          <DialogTitle>Add to deck</DialogTitle>
          <DialogDescription>Plan cards without changing your collection.</DialogDescription>
          {open ? (
            <AddDeckCardForm
              key={detail.selectedPrinting.id}
              detail={detail}
              onAdded={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddDeckCardForm({
  detail,
  deckId,
  onAdded,
}: {
  detail: CatalogCardDetail;
  deckId?: string;
  onAdded: () => void;
}) {
  const decks = useDecks().filter((deck) => !deck.archived || deck.id === deckId);
  const [selectedDeck, setSelectedDeck] = useState(deckId ?? decks[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [section, setSection] = useState<DeckSection>("mainboard");
  const finishes = detail.selectedPrinting.finishes ?? [];
  const [finish, setFinish] = useState(
    finishes.find((value) => value === "nonfoil") ?? finishes[0] ?? "nonfoil",
  );
  const mutations = useDeckMutations();
  const add = useMutation({
    mutationFn: async () => {
      await mutations.add(selectedDeck, {
        printingId: detail.selectedPrinting.id,
        quantity,
        section,
        finish,
      });
      onAdded();
    },
  });
  return (
    <Form
      style={editorStyles.fields}
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <p>
        {detail.card.name} · {detail.selectedPrinting.setCode.toUpperCase()}{" "}
        {detail.selectedPrinting.collectorNumber}
      </p>
      <PrintingPrice printingId={detail.selectedPrinting.id} finish={finish} />
      {!deckId ? (
        <EditorSelect
          label="Deck"
          options={decks.map((deck) => ({ label: deck.name, value: deck.id }))}
          value={selectedDeck}
          onChange={setSelectedDeck}
          disabled={add.isPending}
        />
      ) : null}
      {!decks.length ? <EditorMessage>Create a deck on the Decks page first.</EditorMessage> : null}
      <EditorSelect
        label="Section"
        options={deckSectionOptions}
        value={section}
        onChange={setSection}
        disabled={add.isPending}
      />
      <EditorSelect
        label="Finish"
        options={finishes.map((value) => ({ label: value, value }))}
        value={finish}
        onChange={setFinish}
        disabled={add.isPending}
      />
      <DeckQuantity value={quantity} onChange={setQuantity} disabled={add.isPending} />
      {add.error ? <EditorMessage error>{add.error.message}</EditorMessage> : null}
      <Button
        type="submit"
        disabled={
          !selectedDeck ||
          !decks.some((deck) => deck.id === selectedDeck) ||
          !finishes.length ||
          add.isPending
        }
      >
        {add.isPending ? "Adding…" : "Add to deck"}
      </Button>
    </Form>
  );
}
