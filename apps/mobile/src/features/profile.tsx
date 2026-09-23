import { useDeferredValue, useState } from "react";
import { Redirect, router } from "expo-router";
import { profileQuery, readProfile } from "@mooligan/workspace/profile";
import {
  changeProfileBanner,
  featureProfileCard,
} from "@mooligan/workspace/client/profile-mutations";
import { Button, Copy, Field, Panel, Row, Screen } from "@/components/ui";
import { CardImage, CardRow } from "@/components/cards";
import { useMobileAccount } from "@/account/account-provider";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import { CatalogSearch } from "./search";

export default function ProfileScreen() {
  const { auth, runtime } = useMobileAccount();
  if (
    auth.status !== "signed-in" ||
    !auth.user ||
    !runtime.workspaces.some((w) => w.active && w.accountAssociation === "account")
  )
    return <Redirect href="/" />;
  return (
    <Screen>
      <Profile name={auth.user.name} />
    </Screen>
  );
}
function Profile({ name }: { name: string }) {
  const { store, catalog, visibility, lots, decks } = useWorkspace();
  const profile = readProfile(store.useQuery(profileQuery));
  const [selection, setSelection] = useState<number | "banner" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owned = [...new Set(lots.map((lot) => lot.printingId))];
  const ids = [
    ...new Set(
      [...profile.featuredPrintingIds, profile.bannerPrintingId].filter((id) => id !== null),
    ),
  ];
  const { data: printings } = useCatalogQuery(
    ["profile", JSON.stringify(ids)],
    ({ catalog, visibility }) => new Map(ids.map((id) => [id, catalog.detail(id, visibility)])),
  );
  const banner = profile.bannerPrintingId ? printings?.get(profile.bannerPrintingId) : null;
  const { data: collection } = useCatalogQuery(
    ["profile-collection", JSON.stringify(lots)],
    ({ catalog, visibility, lots }) => {
      catalog.project(lots);
      return catalog.collection({ limit: 40 }, visibility);
    },
  );
  const preview = [
    ...new Map(
      collection?.holdings
        .filter((holding) => holding.status === "visible")
        .map((holding) => [holding.printingId, holding]),
    ).values(),
  ].slice(0, 6);
  const detail = async (id: string) => catalog.detail(id, visibility);
  async function select(printingId: string | null) {
    try {
      if (selection === "banner") await changeProfileBanner(store, detail, printingId);
      else if (selection !== null) await featureProfileCard(store, detail, selection, printingId);
      setError(null);
      setSelection(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save this profile choice.");
    }
  }
  return (
    <>
      {banner?.status === "visible" && (
        <CardImage
          large
          art
          image={banner.detail.selectedPrinting.images.find((i) => i.size === "art_crop")}
        />
      )}
      <Copy title={name}>
        {lots.reduce((sum, lot) => sum + lot.quantity, 0)} copies · {owned.length} printings ·{" "}
        {decks.filter((d) => !d.archived).length} active decks
      </Copy>
      <Button quiet label="Change banner" onPress={() => setSelection("banner")} />
      <Copy title="Four favorites">Featured cards from your collection.</Copy>
      {profile.featuredPrintingIds.map((id, slot) => {
        const result = id && owned.includes(id) ? printings?.get(id) : null;
        return (
          <Panel key={slot}>
            {result?.status === "visible" ? (
              <CardRow
                printingId={id!}
                name={result.detail.card.name}
                detail={result.detail.selectedPrinting.setName}
                image={result.detail.selectedPrinting.images.find((i) => i.size === "small")}
              />
            ) : (
              <Copy>
                {result?.status === "protected" ? "Protected preview" : `Featured slot ${slot + 1}`}
              </Copy>
            )}
            <Button
              quiet
              label={id ? "Replace or unpin" : "Pin a card"}
              onPress={() => setSelection(slot)}
            />
          </Panel>
        );
      })}
      {selection !== null && (
        <Panel>
          <Copy
            title={selection === "banner" ? "Choose banner artwork" : "Choose a card you own"}
          />
          <Row>
            <Button quiet label="Cancel" onPress={() => setSelection(null)} />
            <Button
              quiet
              label={selection === "banner" ? "Remove banner" : "Unpin card"}
              onPress={() => select(null)}
            />
          </Row>
          {error && <Copy>{error}</Copy>}
          {selection === "banner" ? (
            <CatalogSearch onSelect={(card) => void select(card.id)} />
          ) : (
            <OwnedCardPicker onSelect={select} />
          )}
        </Panel>
      )}
      <Copy title="Collection" />
      {preview.map((holding) => (
        <CardRow
          key={holding.printingId}
          printingId={holding.printingId}
          name={holding.name}
          detail={holding.setName}
          image={holding.image}
        />
      ))}
      <Button quiet label="View collection" onPress={() => router.push("/collection")} />
      <Copy title="Active decks" />
      {decks
        .filter((deck) => !deck.archived)
        .map((deck) => (
          <Button
            quiet
            key={deck.id}
            label={deck.name}
            onPress={() =>
              router.push({ pathname: "/decks/[deckId]", params: { deckId: deck.id } })
            }
          />
        ))}
    </>
  );
}

function OwnedCardPicker({ onSelect }: { onSelect: (id: string) => Promise<void> }) {
  const { lots } = useWorkspace();
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const deferred = useDeferredValue(query);
  const result = useCatalogQuery(
    ["profile-picker", JSON.stringify(lots), deferred, offset],
    ({ catalog, visibility, lots }) => {
      catalog.project(lots);
      return catalog.collection({ query: deferred, offset, limit: 30 }, visibility);
    },
  );
  const cards = [
    ...new Map(
      result.data?.holdings
        .filter((holding) => holding.status === "visible")
        .map((holding) => [holding.printingId, holding]),
    ).values(),
  ];
  return (
    <>
      <Field
        label="Search owned cards"
        value={query}
        maxLength={500}
        onChangeText={(value) => {
          setQuery(value);
          setOffset(0);
        }}
      />
      {result.error && <Copy>{result.error.message}</Copy>}
      {cards.map((holding) => (
        <CardRow
          key={holding.printingId}
          printingId={holding.printingId}
          name={holding.name}
          detail={holding.setName}
          image={holding.image}
          onPress={() => void onSelect(holding.printingId)}
        />
      ))}
      {!cards.length && <Copy>No visible owned cards match this search.</Copy>}
      <Row>
        <Button
          quiet
          label="Previous"
          disabled={!offset}
          onPress={() => setOffset(Math.max(0, offset - 30))}
        />
        <Button
          quiet
          label="Next"
          disabled={!result.data?.hasMore}
          onPress={() => setOffset(offset + 30)}
        />
      </Row>
    </>
  );
}
