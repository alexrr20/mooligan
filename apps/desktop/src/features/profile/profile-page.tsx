import { collectionLotsQuery, profileQuery, readProfile } from "@mooligan/workspace/schema";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { AuthUser } from "../../../shared/desktop-api";
import { Button } from "../../components/ui/button";
import { PrintingImage } from "../cards/printing-image";
import { useCatalogCardDetail } from "../cards/use-card-detail";
import { catalogImageUrl } from "../catalog/catalog-image";
import { useCollection } from "../collection/use-collection";
import { DeckGrid } from "../decks/deck-grid";
import { useDecks } from "../decks/use-decks";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";
import { ProfilePicker, type ProfileSelection } from "./profile-picker";
import { profileStyles as styles } from "./profile-styles";

export function ProfilePage({ user }: { user: AuthUser }) {
  const store = useWorkspaceLiveStore();
  const profile = readProfile(store.useQuery(profileQuery));
  const lots = store.useQuery(collectionLotsQuery);
  const owned = new Set(lots.map(({ printingId }) => printingId));
  const collection = useCollection({});
  const decks = useDecks()
    .filter((deck) => !deck.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [selection, setSelection] = useState<ProfileSelection | null>(null);
  const featuredCount = profile.featuredPrintingIds.filter((id) => id && owned.has(id)).length;
  const visibleHoldings = collection.holdings.filter((holding) => holding.status === "visible");
  const preview = [
    ...new Map(visibleHoldings.map((holding) => [holding.printingId, holding])).values(),
  ].slice(0, 6);
  const copies = lots.reduce((total, lot) => total + lot.quantity, 0);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.hero)}>
        {profile.bannerPrintingId ? (
          <ProfileBanner key={profile.bannerPrintingId} printingId={profile.bannerPrintingId} />
        ) : null}
        <div {...stylex.props(styles.shade)} />
        <div {...stylex.props(styles.heroTop)}>
          <p {...stylex.props(styles.eyebrow)}>My profile</p>
          <Button
            variant="secondary"
            size="sm"
            id="profile-banner-button"
            onClick={() => setSelection({ kind: "banner" })}
          >
            Change banner
          </Button>
        </div>
        <div {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.avatar)} aria-hidden="true">
            {user.name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("") || "M"}
          </span>
          <div>
            <p {...stylex.props(styles.eyebrow)}>Magic: The Gathering</p>
            <h1 {...stylex.props(styles.name)}>{user.name}</h1>
          </div>
        </div>
      </header>
      <div {...stylex.props(styles.content)}>
        <dl {...stylex.props(styles.stats)}>
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.muted)}>Copies in collection</dt>
            <dd {...stylex.props(styles.statValue)}>{copies.toLocaleString()}</dd>
          </div>
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.muted)}>Printings owned</dt>
            <dd {...stylex.props(styles.statValue)}>{owned.size.toLocaleString()}</dd>
          </div>
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.muted)}>Active decks</dt>
            <dd {...stylex.props(styles.statValue)}>{decks.length.toLocaleString()}</dd>
          </div>
        </dl>

        <section {...stylex.props(styles.section)} aria-labelledby="featured-heading">
          <div {...stylex.props(styles.sectionHeader)}>
            <div>
              <h2 id="featured-heading" {...stylex.props(styles.title)}>
                Featured cards
              </h2>
              <p {...stylex.props(styles.muted)}>Four favorites from your collection.</p>
            </div>
            <span {...stylex.props(styles.muted)}>{featuredCount} / 4 pinned</span>
          </div>
          <ol {...stylex.props(styles.features)}>
            {profile.featuredPrintingIds.map((id, slot) => (
              <li
                key={slot}
                id={`profile-slot-${slot}`}
                tabIndex={-1}
                {...stylex.props(styles.slot)}
              >
                {id && owned.has(id) ? (
                  <FeaturedCard
                    key={id}
                    printingId={id}
                    onEdit={() => setSelection({ kind: "card", slot })}
                  />
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      style={styles.emptySlot}
                      onClick={() => setSelection({ kind: "card", slot })}
                      aria-label={`Choose featured card ${slot + 1}`}
                    >
                      <span {...stylex.props(styles.slotNumber)} aria-hidden="true">
                        0{slot + 1}
                      </span>
                      <span>Pin a card</span>
                    </Button>
                    <p {...stylex.props(styles.muted)}>
                      {id ? "No longer in your collection" : "Make this spot yours"}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section {...stylex.props(styles.section)} aria-labelledby="profile-collection-heading">
          <div {...stylex.props(styles.sectionHeader)}>
            <h2 id="profile-collection-heading" {...stylex.props(styles.title)}>
              Collection
            </h2>
            <Link to="/collection" {...stylex.props(styles.link)}>
              View collection ↗
            </Link>
          </div>
          {collection.error ? (
            <div role="alert" {...stylex.props(styles.empty)}>
              <p {...stylex.props(styles.error)}>{collection.error}</p>
              <Button variant="secondary" onClick={() => void collection.retry()}>
                Try again
              </Button>
            </div>
          ) : preview.length ? (
            <ul {...stylex.props(styles.collection)}>
              {preview.map((holding) => (
                <li key={holding.printingId}>
                  <Link
                    to="/cards/$printingId"
                    params={{ printingId: holding.printingId }}
                    {...stylex.props(styles.link)}
                    aria-label={holding.name}
                  >
                    <PrintingImage image={holding.gridImage ?? holding.image} />
                    <p {...stylex.props(styles.cardName)}>{holding.name}</p>
                    <p {...stylex.props(styles.muted)}>
                      {holding.setCode.toUpperCase()} · {holding.collectorNumber}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div {...stylex.props(styles.empty)}>
              <h3 {...stylex.props(styles.cardName)}>
                {collection.loading
                  ? "Loading collection…"
                  : copies
                    ? "Your cards are kept out of view"
                    : "Start with a card you love"}
              </h3>
              <p {...stylex.props(styles.muted)}>
                {copies
                  ? "Protected previews and unavailable printings stay in your collection."
                  : "Add the cards you own, then choose four to feature here."}
              </p>
              <Link to="/collection" {...stylex.props(styles.link)}>
                Open collection ↗
              </Link>
            </div>
          )}
        </section>

        <section {...stylex.props(styles.section)} aria-labelledby="profile-decks-heading">
          <div {...stylex.props(styles.sectionHeader)}>
            <h2 id="profile-decks-heading" {...stylex.props(styles.title)}>
              Decks
            </h2>
            <Link to="/decks" {...stylex.props(styles.link)}>
              View all decks ↗
            </Link>
          </div>
          {decks.length ? (
            <DeckGrid decks={decks.slice(0, 6)} />
          ) : (
            <div {...stylex.props(styles.empty)}>
              <h3 {...stylex.props(styles.cardName)}>Your next deck starts here</h3>
              <p {...stylex.props(styles.muted)}>
                Build a deck and it will appear on your profile.
              </p>
              <Link to="/decks" {...stylex.props(styles.link)}>
                Create a deck ↗
              </Link>
            </div>
          )}
        </section>
      </div>
      {selection ? (
        <ProfilePicker selection={selection} profile={profile} onClose={() => setSelection(null)} />
      ) : null}
    </div>
  );
}

function ProfileBanner({ printingId }: { printingId: string }) {
  const { result } = useCatalogCardDetail(printingId);
  const [failed, setFailed] = useState(false);
  if (result?.status !== "visible" || failed) return null;
  const image = result.detail.selectedPrinting.images.find(
    (image) => image.faceIndex === 0 && image.size === "art_crop",
  );
  return image ? (
    <img
      {...stylex.props(styles.banner)}
      src={catalogImageUrl(image)}
      onError={() => setFailed(true)}
      alt={`Banner artwork from ${result.detail.card.name}`}
    />
  ) : null;
}

function FeaturedCard({ printingId, onEdit }: { printingId: string; onEdit: () => void }) {
  const { result, loading, error, retry } = useCatalogCardDetail(printingId);
  const detail = result?.status === "visible" ? result.detail : null;
  const image = detail?.selectedPrinting.images.find(
    (image) => image.faceIndex === 0 && image.size === "normal",
  );
  const name =
    detail?.card.name ??
    (loading
      ? "Loading card…"
      : result?.status === "protected"
        ? "Protected preview"
        : "Card unavailable");
  return (
    <>
      {detail ? (
        <Link
          to="/cards/$printingId"
          params={{ printingId }}
          aria-label={name}
          {...stylex.props(styles.link)}
        >
          <PrintingImage image={image} />
        </Link>
      ) : (
        <PrintingImage
          concealed
          placeholder={<span {...stylex.props(styles.muted)}>{name}</span>}
        />
      )}
      <div {...stylex.props(styles.slotFooter)}>
        <div>
          <p {...stylex.props(styles.cardName)}>{name}</p>
          {detail ? (
            <p {...stylex.props(styles.muted)}>
              {detail.selectedPrinting.setCode.toUpperCase()} ·{" "}
              {detail.selectedPrinting.collectorNumber}
            </p>
          ) : null}
        </div>
        <Button
          size="xs"
          variant="ghost"
          onClick={onEdit}
          aria-label={`Edit featured card ${name}`}
        >
          Edit
        </Button>
      </div>
      {error ? (
        <Button size="xs" variant="ghost" onClick={() => void retry()}>
          Retry card
        </Button>
      ) : null}
    </>
  );
}
