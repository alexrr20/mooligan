import { PrintingPrice } from "../prices/printing-price";
import { finishLabels } from "@mooligan/domain/catalog";
import {
  cardConditionLabels,
  cardLanguageLabels,
  type CollectionHolding,
} from "@mooligan/domain/collection";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { colors } from "../../styles/tokens.stylex.js";
import { PrintingImage } from "../cards/printing-image";
import { withCollectionOrigin, type CollectionOrigin } from "./collection-origin";
import { cleanCollectionError, CollectionFormDialog } from "./collection-editor";
import { useCollectionMutations } from "./use-collection-mutations";

type CollectionResultsProps = {
  grid: boolean;
  holdings: CollectionHolding[];
  origin: CollectionOrigin;
};

type EditableHolding = Exclude<CollectionHolding, { status: "protected" }> & {
  editableLotId: string;
};

export function CollectionResults({ grid, holdings, origin }: CollectionResultsProps) {
  const collection = useCollectionMutations();
  const [editing, setEditing] = useState<EditableHolding | null>(null);
  const [pendingLotId, setPendingLotId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function remove(holding: EditableHolding) {
    const label = holding.status === "visible" ? holding.name : holding.label;
    const confirmed = window.confirm(
      `Remove ${holding.quantity.toLocaleString()} ${propertySummary(holding)} ${label} ${holding.quantity === 1 ? "copy" : "copies"} from your Collection?`,
    );
    if (!confirmed) return;

    setPendingLotId(holding.editableLotId);
    setError("");
    try {
      await collection.remove({ lotId: holding.editableLotId });
    } catch (cause) {
      setError(cleanCollectionError(cause));
    } finally {
      setPendingLotId(null);
    }
  }

  return (
    <>
      {error ? (
        <p {...stylex.props(styles.error)} role="alert">
          {error}
        </p>
      ) : null}
      {!grid ? (
        <div {...stylex.props(styles.columnHead)} aria-hidden="true">
          <span>Card</span>
          <span />
          <span>Properties</span>
          <span>Copies</span>
          <span>Actions</span>
        </div>
      ) : null}
      <ol {...stylex.props(styles.list, grid && styles.grid)}>
        {holdings.map((holding, index) => {
          const editable = isEditableHolding(holding) ? holding : null;
          const itemKey =
            holding.status === "protected"
              ? `protected:${holding.routePrintingId}:${index}`
              : [holding.printingId, holding.finish, holding.language, holding.condition].join(":");

          return (
            <li {...stylex.props(styles.item, grid && styles.tile)} key={itemKey}>
              <HoldingArtwork holding={holding} grid={grid} origin={origin} />
              <HoldingIdentity holding={holding} grid={grid} origin={origin} />
              {holding.status !== "protected" ? (
                <div {...stylex.props(styles.properties, grid && styles.tileProperties)}>
                  <span>{finishLabels[holding.finish]}</span>
                  <span>· {cardLanguageLabels[holding.language]}</span>
                  <span>· {cardConditionLabels[holding.condition]}</span>
                </div>
              ) : (
                <div {...stylex.props(styles.properties, grid && styles.tileProperties)}>
                  <span>Spoiler protection</span>
                </div>
              )}
              <div {...stylex.props(styles.quantity, grid && styles.tileQuantity)}>
                <strong>{holding.quantity.toLocaleString()}</strong>
                <span>{holding.quantity === 1 ? "copy" : "copies"}</span>
              </div>
              <div {...stylex.props(styles.actions, grid && styles.tileActions)}>
                {editable ? (
                  <>
                    <Button
                      style={styles.action}
                      variant="ghost"
                      size="sm"
                      disabled={pendingLotId === editable.editableLotId}
                      type="button"
                      onClick={() => setEditing(editable)}
                    >
                      Edit
                    </Button>
                    <Button
                      style={[styles.action, styles.removeAction]}
                      variant="ghost"
                      size="sm"
                      disabled={pendingLotId === editable.editableLotId}
                      type="button"
                      onClick={() => void remove(editable)}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <span {...stylex.props(styles.readOnly)}>
                    {holding.status === "protected" ? "Reveal to manage" : "Lot details retained"}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {editing ? (
        <CollectionFormDialog
          availableFinishes={
            editing.status === "visible" ? editing.availableFinishes : [editing.finish]
          }
          cardName={editing.status === "visible" ? editing.name : editing.label}
          finishLocked={editing.status === "unavailable"}
          initial={{
            condition: editing.condition,
            finish: editing.finish,
            language: editing.language,
            quantity: editing.quantity,
          }}
          mergeNotice
          open
          printingLabel={
            editing.status === "visible"
              ? `${editing.setName} · #${editing.collectorNumber}`
              : editing.printingId
          }
          submitLabel="Save changes"
          title="Edit holding"
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSubmit={(value) => collection.update({ ...value, lotId: editing.editableLotId })}
        />
      ) : null}
    </>
  );
}

function HoldingArtwork({
  grid,
  holding,
  origin,
}: {
  grid: boolean;
  holding: CollectionHolding;
  origin: CollectionOrigin;
}) {
  const image =
    holding.status === "visible"
      ? grid
        ? (holding.gridImage ?? holding.image)
        : holding.image
      : null;
  const artwork = (
    <PrintingImage
      alt={holding.status === "visible" ? `${holding.name}, ${holding.setName} printing` : ""}
      compact={!grid}
      concealed={holding.status === "protected"}
      finish={holding.status === "visible" ? holding.finish : undefined}
      image={image}
      placeholder={
        holding.status === "protected" ? (
          <span {...stylex.props(styles.protectedMark)} aria-hidden="true">
            ?
          </span>
        ) : undefined
      }
    />
  );

  if (holding.status === "visible") {
    return (
      <Link
        {...stylex.props(styles.artwork)}
        params={{ printingId: holding.printingId }}
        state={withCollectionOrigin(origin)}
        to="/cards/$printingId"
      >
        {artwork}
      </Link>
    );
  }
  if (holding.status === "protected") {
    return (
      <Link
        {...stylex.props(styles.artwork)}
        params={{ printingId: holding.routePrintingId }}
        state={withCollectionOrigin(origin)}
        to="/cards/$printingId"
      >
        {artwork}
      </Link>
    );
  }
  return <div {...stylex.props(styles.artwork)}>{artwork}</div>;
}

function HoldingIdentity({
  grid,
  holding,
  origin,
}: {
  grid: boolean;
  holding: CollectionHolding;
  origin: CollectionOrigin;
}) {
  if (holding.status === "visible") {
    return (
      <div {...stylex.props(styles.identity, grid && styles.tileIdentity)}>
        <Link
          {...stylex.props(styles.name)}
          params={{ printingId: holding.printingId }}
          state={withCollectionOrigin(origin)}
          to="/cards/$printingId"
        >
          {holding.name}
        </Link>
        <span {...stylex.props(styles.printing)}>
          {holding.setName} · {holding.setCode.toUpperCase()} #{holding.collectorNumber}
        </span>
        <PrintingPrice printingId={holding.printingId} finish={holding.finish} />
      </div>
    );
  }
  if (holding.status === "protected") {
    return (
      <div {...stylex.props(styles.identity, grid && styles.tileIdentity)}>
        <Link
          {...stylex.props(styles.name)}
          params={{ printingId: holding.routePrintingId }}
          state={withCollectionOrigin(origin)}
          to="/cards/$printingId"
        >
          {holding.label}
        </Link>
        <span {...stylex.props(styles.printing)}>Open the protection gate to reveal it</span>
      </div>
    );
  }
  return (
    <div {...stylex.props(styles.identity, grid && styles.tileIdentity)}>
      <strong {...stylex.props(styles.name)}>{holding.label}</strong>
      <span {...stylex.props(styles.printing)}>Catalog ID {holding.printingId}</span>
    </div>
  );
}

function propertySummary(holding: Exclude<CollectionHolding, { status: "protected" }>) {
  return `${finishLabels[holding.finish]}, ${cardLanguageLabels[holding.language]}, ${cardConditionLabels[holding.condition]}`;
}

function isEditableHolding(holding: CollectionHolding): holding is EditableHolding {
  return holding.status !== "protected" && holding.editableLotId !== null;
}

const styles = stylex.create({
  error: {
    margin: "18px 0",
    padding: "12px 16px",
    borderRadius: "8px",
    color: "#f1c7c3",
    backgroundColor: "#2d1e1e",
    fontSize: "13px",
  },
  columnHead: {
    padding: "8px 12px 14px",
    display: "grid",
    gridTemplateColumns: "56px minmax(150px, 1.3fr) minmax(180px, 1fr) 70px 132px",
    alignItems: "center",
    gap: "16px",
    color: "#85887f",
    fontSize: "12px",
    "@media (max-width: 980px)": { display: "none" },
  },
  list: { margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "4px" },
  item: {
    minHeight: "100px",
    padding: "12px",
    display: "grid",
    gridTemplateColumns: "56px minmax(150px, 1.3fr) minmax(180px, 1fr) 70px 132px",
    alignItems: "center",
    gap: "16px",
    borderRadius: "9px",
    ":hover": { backgroundColor: "#191b18" },
    "@media (max-width: 980px)": {
      gridTemplateColumns: "48px minmax(0, 1fr) auto",
      gap: "8px 14px",
    },
  },
  grid: {
    paddingBlock: "4px 16px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))",
    gap: "16px 12px",
  },
  tile: {
    minHeight: 0,
    minWidth: 0,
    padding: 0,
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    alignContent: "start",
    gap: 0,
    ":hover": { backgroundColor: "transparent" },
    "@media (max-width: 980px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: 0 },
  },
  artwork: {
    width: "100%",
    color: "inherit",
    textDecoration: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "4px" },
  },
  protectedMark: { color: colors.accent, fontSize: "24px" },
  identity: { minWidth: 0, display: "grid", gap: "6px" },
  tileIdentity: { padding: "8px 1px 0" },
  name: {
    color: "#f4f1e8",
    fontSize: "13px",
    fontWeight: 400,
    lineHeight: 1.35,
    textDecoration: "none",
    overflowWrap: "anywhere",
    ":hover": { color: colors.accent },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "3px" },
  },
  printing: { color: "#989b92", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" },
  properties: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "3px",
    color: "#989b92",
    fontSize: "12px",
    lineHeight: 1.5,
    "@media (max-width: 980px)": { gridColumn: "2 / -1" },
  },
  tileProperties: {
    marginTop: "4px",
    gridColumn: "auto",
    "@media (max-width: 980px)": { gridColumn: "auto" },
  },
  quantity: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: "5px",
    fontSize: "13px",
    color: "#b8baaf",
    fontVariantNumeric: "tabular-nums",
    "@media (max-width: 980px)": { gridColumn: "3", gridRow: "1" },
  },
  tileQuantity: {
    marginTop: "6px",
    color: "#f4f1e8",
    "@media (max-width: 980px)": { gridColumn: "auto", gridRow: "auto" },
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "2px",
    "@media (max-width: 980px)": { gridColumn: "2 / -1", justifyContent: "flex-start" },
  },
  tileActions: {
    marginTop: "6px",
    gridColumn: "auto",
    justifyContent: "flex-start",
    "@media (max-width: 980px)": { gridColumn: "auto" },
  },
  action: {
    borderWidth: 0,
    color: "#b8baaf",
    fontSize: "12px",
    height: "32px",
    paddingInline: "8px",
  },
  removeAction: { color: "#989b92", ":hover": { color: "#f1c7c3", backgroundColor: "#2d1e1e" } },
  readOnly: { color: "#989b92", fontSize: "11px", lineHeight: 1.5 },
});
