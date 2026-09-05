import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import type { DeckSection } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { useCatalogCardDetail } from "../cards/use-card-detail";
import {
  DeckMessage,
  DeckQuantity,
  DeckSelect,
  deckSectionOptions,
  deckStyles,
} from "./deck-controls";
import { useDeckMutations, useDecks } from "./use-decks";

export function DeckCardPicker({ deckId }: { deckId: string }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState({ query: "", offset: 0 });
  const [selected, setSelected] = useState<string>();
  const results = useQuery({
    queryKey: ["catalog", "deck-search", search],
    queryFn: () => window.catalog.list({ ...search, limit: 30, includeDigital: true }),
    enabled: !!search.query,
  });
  return (
    <section {...stylex.props(deckStyles.panel)} aria-labelledby="deck-card-search">
      <h2 id="deck-card-search" {...stylex.props(deckStyles.sectionTitle)}>
        Add cards
      </h2>
      <Form
        style={deckStyles.toolbar}
        onSubmit={(event) => {
          event.preventDefault();
          setSearch({ query: input.trim(), offset: 0 });
        }}
      >
        <label {...stylex.props(deckStyles.field, deckStyles.grow)}>
          Search the local catalog
          <Input
            value={input}
            maxLength={500}
            onValueChange={setInput}
            placeholder="Name or query, such as t:creature c:green"
          />
        </label>
        <Button type="submit" disabled={!input.trim()}>
          Search
        </Button>
      </Form>
      {results.isFetching ? <DeckMessage>Searching…</DeckMessage> : null}
      {results.error || results.data?.queryError ? (
        <DeckMessage error>{results.error?.message ?? results.data?.queryError}</DeckMessage>
      ) : null}
      {search.query && results.data && !results.data.cards.length && !results.data.queryError ? (
        <DeckMessage>No visible cards match this search.</DeckMessage>
      ) : null}
      <ul {...stylex.props(deckStyles.list)}>
        {results.data?.cards.map((card) => (
          <li key={card.id} {...stylex.props(deckStyles.row)}>
            <div {...stylex.props(deckStyles.grow)}>
              <strong>{card.name}</strong>
              <p {...stylex.props(deckStyles.muted)}>
                {card.setName} · {card.setCode.toUpperCase()} {card.collectorNumber}
                {card.isDigital ? " · Digital" : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setSelected(card.id)}
              aria-label={`Add ${card.name} from ${card.setCode} ${card.collectorNumber}`}
            >
              Add
            </Button>
          </li>
        ))}
      </ul>
      {search.offset > 0 || results.data?.hasMore ? (
        <div {...stylex.props(deckStyles.toolbar)}>
          <Button
            disabled={search.offset === 0 || results.isFetching}
            variant="secondary"
            onClick={() => setSearch({ ...search, offset: Math.max(0, search.offset - 30) })}
          >
            Previous
          </Button>
          <Button
            disabled={!results.data?.hasMore || results.isFetching}
            variant="secondary"
            onClick={() => setSearch({ ...search, offset: search.offset + 30 })}
          >
            Next
          </Button>
        </div>
      ) : null}
      {selected ? (
        <SelectedCardDialog
          printingId={selected}
          deckId={deckId}
          onClose={() => setSelected(undefined)}
        />
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
      <DialogContent style={deckStyles.dialog}>
        <DialogTitle>Add card to deck</DialogTitle>
        <DialogDescription>Choose the quantity, finish, and section.</DialogDescription>
        {card.result?.status === "visible" ? (
          <AddDeckCardForm detail={card.result.detail} deckId={deckId} onAdded={onClose} />
        ) : (
          <DeckMessage error={!card.loading}>
            {card.loading
              ? "Reading printing…"
              : card.error || "This printing is unavailable or protected."}
          </DeckMessage>
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
        <DialogContent style={deckStyles.dialog}>
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
      style={deckStyles.fields}
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <p>
        {detail.card.name} · {detail.selectedPrinting.setCode.toUpperCase()}{" "}
        {detail.selectedPrinting.collectorNumber}
      </p>
      {!deckId ? (
        <DeckSelect
          label="Deck"
          options={decks.map((deck) => ({ label: deck.name, value: deck.id }))}
          value={selectedDeck}
          onChange={setSelectedDeck}
          disabled={add.isPending}
        />
      ) : null}
      {!decks.length ? <DeckMessage>Create a deck on the Decks page first.</DeckMessage> : null}
      <DeckSelect
        label="Section"
        options={deckSectionOptions}
        value={section}
        onChange={setSection}
        disabled={add.isPending}
      />
      <DeckSelect
        label="Finish"
        options={finishes.map((value) => ({ label: value, value }))}
        value={finish}
        onChange={setFinish}
        disabled={add.isPending}
      />
      <DeckQuantity value={quantity} onChange={setQuantity} disabled={add.isPending} />
      {add.error ? <DeckMessage error>{add.error.message}</DeckMessage> : null}
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
