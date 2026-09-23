import { Menu } from "@base-ui/react/menu";
import { PreviewCard } from "@base-ui/react/preview-card";
import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";
import type { Deck, DeckEntry } from "@mooligan/workspace/deck-contract";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { tagColorStyles } from "@mooligan/presentation/tags";
import { type CardTag } from "@mooligan/workspace/tag-contract";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { OracleText } from "../cards/oracle-text";
import { PrintingImage } from "../cards/printing-image";
import type { CardView } from "../preferences/use-view-preference";
import { PrintingPrice } from "../prices/printing-price";
import { CardTagBadge, TagCheckbox } from "../tags/card-tag-controls";
import { withCardDetailOrigin } from "../cards/card-detail-origin";

export function DeckCardItem({
  deck,
  entry,
  printing,
  view,
  image,
  imageActive,
  imageFailed,
  imageKey,
  onImageError,
  onImageLoad,
  tags,
  selected,
  onSelect,
  onTag,
  onEdit,
  onRemove,
}: {
  deck: Deck;
  entry: DeckEntry;
  printing: CatalogPrintingResult | null | undefined;
  view: CardView;
  image: CatalogImageDescriptor | undefined;
  imageActive: boolean;
  imageFailed: boolean;
  imageKey: string;
  onImageError: () => void;
  onImageLoad: () => void;
  tags: readonly CardTag[];
  selected: boolean;
  onSelect?: (checked: boolean) => void;
  onTag?: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const detail = printing?.status === "visible" ? printing.detail : null;
  const concealed = printing?.status === "protected";
  const name = detail?.card.name ?? (concealed ? "Protected preview" : "Printing unavailable");
  const manaCost = detail?.card.faces[0]?.manaCost;
  const legality = detail?.legalities.find(({ formatId }) => formatId === deck.formatId);
  const warning =
    legality && legality.status !== "legal" ? legality.status.replaceAll("_", " ") : null;
  const edition = detail
    ? `${detail.selectedPrinting.setCode.toUpperCase()} ${detail.selectedPrinting.collectorNumber} · ${entry.finish}`
    : entry.finish;
  const nameLink = (
    <Link
      to="/cards/$printingId"
      params={{ printingId: entry.printingId }}
      state={withCardDetailOrigin({ kind: "deck", deckId: deck.id })}
      search={{}}
      className="deck-card-name"
      aria-label={`View ${name}`}
    >
      {name}
    </Link>
  );

  return (
    <li
      className="deck-card-item"
      data-selected={selected || undefined}
      data-no-art={!image || imageFailed || undefined}
    >
      <div className="deck-card-line">
        {onSelect ? (
          <TagCheckbox label={`Select ${name}`} checked={selected} onChange={onSelect} />
        ) : (
          <span className="deck-card-checkbox-space" />
        )}
        <span className="deck-card-quantity" title={`${entry.quantity} copies`}>
          {entry.quantity}
        </span>
        {view === "list" ? (
          <PreviewCard.Root>
            <PreviewCard.Trigger render={nameLink} delay={250} />
            <PreviewCard.Portal>
              <PreviewCard.Positioner
                side="right"
                sideOffset={12}
                className="deck-card-popup-positioner"
              >
                <PreviewCard.Popup className="deck-card-preview">
                  <PrintingImage
                    image={image}
                    finish={entry.finish}
                    concealed={concealed}
                    failed={previewFailed}
                    onImageError={() => setPreviewFailed(true)}
                    placeholder={name}
                  />
                  <div className="deck-card-preview-details">
                    <strong>{name}</strong>
                    <span>{edition}</span>
                    {tags.length ? (
                      <div className="deck-card-tags">
                        {tags.map((tag) => (
                          <CardTagBadge key={tag.id} tag={tag} />
                        ))}
                      </div>
                    ) : null}
                    {detail && !detail.selectedPrinting.isDigital ? (
                      <PrintingPrice printingId={entry.printingId} finish={entry.finish} />
                    ) : null}
                  </div>
                </PreviewCard.Popup>
              </PreviewCard.Positioner>
            </PreviewCard.Portal>
          </PreviewCard.Root>
        ) : (
          nameLink
        )}
        {warning ? (
          <span className="deck-card-warning" title={warning} aria-label={warning}>
            !
          </span>
        ) : null}
        {view === "list" ? (
          <>
            {entry.finish !== "nonfoil" ? (
              <span className="deck-card-finish" title={entry.finish} aria-label={entry.finish}>
                ✦
              </span>
            ) : null}
            {tags.length ? (
              <span
                className="deck-card-tag-dots"
                aria-label={tags.map((tag) => tag.name).join(", ")}
                title={tags.map((tag) => tag.name).join(", ")}
              >
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    style={{
                      backgroundColor: tagColorStyles[tag.color].hex,
                    }}
                  />
                ))}
              </span>
            ) : null}
            {manaCost ? <OracleText className="deck-card-mana" text={manaCost} /> : null}
          </>
        ) : null}
        <Menu.Root>
          <Menu.Trigger
            render={<Button variant="ghost" size="icon-xs" />}
            aria-label={`Actions for ${name}`}
          >
            <span aria-hidden="true">⋯</span>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="end" sideOffset={4} className="deck-card-popup-positioner">
              <Menu.Popup className="deck-card-menu">
                <div className="deck-card-menu-details">
                  <strong>{name}</strong>
                  <span>{edition}</span>
                  {entry.section === "commander" ? <span>Commander</span> : null}
                  {warning ? <span className="deck-card-warning">{warning}</span> : null}
                  {tags.length ? (
                    <div className="deck-card-tags">
                      {tags.map((tag) => (
                        <CardTagBadge key={tag.id} tag={tag} />
                      ))}
                    </div>
                  ) : null}
                  {detail && !detail.selectedPrinting.isDigital ? (
                    <PrintingPrice printingId={entry.printingId} finish={entry.finish} />
                  ) : null}
                </div>
                <Menu.Item onClick={onEdit} className="deck-card-menu-item">
                  Edit card
                </Menu.Item>
                {onTag ? (
                  <Menu.Item onClick={onTag} className="deck-card-menu-item">
                    Edit tags
                  </Menu.Item>
                ) : null}
                <Menu.Item onClick={onRemove} className="deck-card-menu-item deck-card-remove">
                  Remove card
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      {view !== "list" ? (
        <>
          <Link
            to="/cards/$printingId"
            params={{ printingId: entry.printingId }}
            state={withCardDetailOrigin({ kind: "deck", deckId: deck.id })}
            search={{}}
            className="deck-card-artwork"
            aria-label={`View ${name}, ${entry.quantity} ${entry.quantity === 1 ? "copy" : "copies"}`}
          >
            <PrintingImage
              image={image}
              finish={entry.finish}
              concealed={concealed}
              imageActive={imageActive}
              failed={imageFailed}
              imageKey={imageKey}
              placeholder={concealed || !image ? name : undefined}
              onImageError={onImageError}
              onImageLoad={onImageLoad}
            />
          </Link>
          <div className="deck-card-footer">
            <span>{edition}</span>
            {detail && !detail.selectedPrinting.isDigital ? (
              <PrintingPrice printingId={entry.printingId} finish={entry.finish} />
            ) : null}
            {tags.length ? (
              <div className="deck-card-tags">
                {tags.map((tag) => (
                  <CardTagBadge key={tag.id} tag={tag} />
                ))}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </li>
  );
}
