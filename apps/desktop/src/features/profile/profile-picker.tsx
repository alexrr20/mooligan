import { PrintingPrice } from "../prices/printing-price";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { ProfileSettings } from "@mooligan/workspace/profile-contract";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { PrintingImage } from "../cards/printing-image";
import { useCollection } from "../collection/use-collection";
import { useCatalogSearch } from "../search/use-catalog-search";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import {
  changeProfileBanner,
  featureProfileCard,
} from "@mooligan/workspace/client/profile-mutations";
import { profileStyles as styles } from "./profile-styles";

export type ProfileSelection = { kind: "banner" } | { kind: "card"; slot: number };

export function ProfilePicker({
  selection,
  profile,
  onClose,
}: {
  selection: ProfileSelection;
  profile: ProfileSettings;
  onClose: () => void;
}) {
  const store = useWorkspaceLiveStore();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const save = useMutation({
    mutationFn: (printingId: string | null) =>
      selection.kind === "banner"
        ? changeProfileBanner(store, window.catalog.detail, printingId)
        : featureProfileCard(store, window.catalog.detail, selection.slot, printingId),
    onSuccess: onClose,
  });
  const current =
    selection.kind === "banner"
      ? profile.bannerPrintingId
      : profile.featuredPrintingIds[selection.slot];
  const excluded =
    selection.kind === "card"
      ? profile.featuredPrintingIds.filter((_, index) => index !== selection.slot)
      : [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent
        style={styles.dialog}
        showCloseButton={!save.isPending}
        finalFocus={() =>
          document.getElementById(
            selection.kind === "banner"
              ? "profile-banner-button"
              : `profile-slot-${selection.slot}`,
          )
        }
      >
        <DialogTitle>
          {selection.kind === "banner"
            ? "Choose banner artwork"
            : `Choose featured card ${selection.slot + 1}`}
        </DialogTitle>
        <DialogDescription>
          {selection.kind === "banner"
            ? "Pick artwork from any visible card in the catalog."
            : "Pin a printing from your collection. You can feature up to four cards."}
        </DialogDescription>
        <Form
          style={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(input.trim());
          }}
        >
          <label {...stylex.props(styles.field)}>
            {selection.kind === "banner" ? "Search cards" : "Search your collection"}
            <Input value={input} onValueChange={setInput} maxLength={500} placeholder="Card name" />
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </Form>
        {save.error ? (
          <p role="alert" {...stylex.props(styles.error)}>
            {save.error.message}
          </p>
        ) : null}
        {save.isPending ? (
          <p role="status" {...stylex.props(styles.muted)}>
            Saving selection…
          </p>
        ) : null}
        {selection.kind === "banner" ? (
          <BannerChoices query={query} busy={save.isPending} onChoose={save.mutate} />
        ) : (
          <CollectionChoices
            query={query}
            busy={save.isPending}
            excluded={excluded}
            onChoose={save.mutate}
          />
        )}
        <div {...stylex.props(styles.sectionHeader)}>
          {current ? (
            <Button variant="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              {selection.kind === "banner" ? "Remove banner" : "Unpin card"}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ChoicesProps = { query: string; busy: boolean; onChoose: (id: string) => void };

function CollectionChoices({
  query,
  busy,
  excluded,
  onChoose,
}: ChoicesProps & { excluded: readonly (string | null)[] }) {
  const collection = useCollection({ query });
  const visible = collection.holdings.filter((holding) => holding.status === "visible");
  const cards = [...new Map(visible.map((holding) => [holding.printingId, holding])).values()].map(
    (holding) => ({
      id: holding.printingId,
      name: holding.name,
      setCode: holding.setCode,
      collectorNumber: holding.collectorNumber,
      image: holding.gridImage ?? holding.image,
      isDigital: false,
    }),
  );
  return (
    <>
      <Choices cards={cards} busy={busy} excluded={excluded} onChoose={onChoose} />
      <ChoiceStatus
        loading={collection.loading}
        error={collection.error}
        count={cards.length}
        hasMore={collection.hasMore}
        busy={busy}
        loadMore={() => collection.loadMore()}
      />
    </>
  );
}

function BannerChoices({ query, busy, onChoose }: ChoicesProps) {
  const results = useCatalogSearch(query, false, false, false, true, false, undefined);
  return (
    <>
      <Choices
        cards={results.cards.map((card) => ({ ...card, image: card.gridImage ?? card.image }))}
        busy={busy}
        excluded={[]}
        onChoose={onChoose}
      />
      <ChoiceStatus
        loading={results.loading}
        error={results.error || results.queryError}
        count={results.cards.length}
        hasMore={results.hasMore}
        busy={busy}
        loadMore={results.loadMore}
      />
    </>
  );
}

type Choice = {
  isDigital: boolean;
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: CatalogImageDescriptor | null;
};

function Choices({
  cards,
  busy,
  excluded,
  onChoose,
}: {
  cards: readonly Choice[];
  busy: boolean;
  excluded: readonly (string | null)[];
  onChoose: (id: string) => void;
}) {
  return (
    <ul {...stylex.props(styles.pickerGrid)}>
      {cards.map((card) => (
        <li key={card.id}>
          <Button
            variant="ghost"
            style={styles.pick}
            disabled={busy || excluded.includes(card.id)}
            onClick={() => onChoose(card.id)}
            aria-label={`Choose ${card.name}, ${card.setCode} ${card.collectorNumber}${excluded.includes(card.id) ? ", already featured" : ""}`}
          >
            <PrintingImage image={card.image} />
            {!card.isDigital ? <PrintingPrice printingId={card.id} /> : null}
            <span {...stylex.props(styles.cardName)}>{card.name}</span>
            <span {...stylex.props(styles.muted)}>
              {excluded.includes(card.id)
                ? "Already featured"
                : `${card.setCode.toUpperCase()} · ${card.collectorNumber}`}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ChoiceStatus({
  loading,
  error,
  count,
  hasMore,
  busy,
  loadMore,
}: {
  loading: boolean;
  error: string;
  count: number;
  hasMore: boolean;
  busy: boolean;
  loadMore: () => void;
}) {
  return (
    <>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : loading ? (
        <p role="status" {...stylex.props(styles.muted)}>
          Loading cards…
        </p>
      ) : !count ? (
        <p {...stylex.props(styles.muted)}>
          No visible cards found. Try another search or add cards to your collection.
        </p>
      ) : null}
      {hasMore ? (
        <Button variant="secondary" disabled={loading || busy} onClick={loadMore}>
          Load more cards
        </Button>
      ) : null}
    </>
  );
}
