import { cardConditions, cardLanguages, type CollectionHolding } from "@mooligan/domain/collection";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { colors } from "../../styles/tokens.stylex.js";
import { PrintingImage } from "../cards/printing-image";
import { withCollectionOrigin, type CollectionOrigin } from "./collection-origin";
import { cleanIpcError, CollectionFormDialog, finishLabel } from "./collection-editor";

type CollectionResultsProps = {
  grid: boolean;
  holdings: CollectionHolding[];
  origin: CollectionOrigin;
};

type EditableHolding = Exclude<CollectionHolding, { status: "protected" }> & {
  editableLotId: string;
};

export function CollectionResults({ grid, holdings, origin }: CollectionResultsProps) {
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
      await window.collection.remove({ lotId: holding.editableLotId });
    } catch (cause) {
      setError(cleanIpcError(cause));
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
          <span>Art</span>
          <span>Card / Printing</span>
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
                  <span>{finishLabel(holding.finish)}</span>
                  <span>{languageLabel(holding.language)}</span>
                  <span>{conditionLabel(holding.condition)}</span>
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
                    <button
                      {...stylex.props(styles.action)}
                      disabled={pendingLotId === editable.editableLotId}
                      type="button"
                      onClick={() => setEditing(editable)}
                    >
                      Edit
                    </button>
                    <button
                      {...stylex.props(styles.action, styles.removeAction)}
                      disabled={pendingLotId === editable.editableLotId}
                      type="button"
                      onClick={() => void remove(editable)}
                    >
                      Remove
                    </button>
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
              ? `${editing.name} · ${editing.setName} #${editing.collectorNumber}`
              : `${editing.label} · ${editing.printingId}`
          }
          title="Edit Holding."
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSubmit={(value) => window.collection.update({ ...value, lotId: editing.editableLotId })}
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
  return `${finishLabel(holding.finish)}, ${languageLabel(holding.language)}, ${conditionLabel(holding.condition)}`;
}

function isEditableHolding(holding: CollectionHolding): holding is EditableHolding {
  return holding.status !== "protected" && holding.editableLotId !== null;
}

function languageLabel(value: string) {
  return cardLanguages.find((language) => language.value === value)?.label ?? value.toUpperCase();
}

function conditionLabel(value: string) {
  return cardConditions.find((condition) => condition.value === value)?.label ?? value;
}

const styles = stylex.create({
  error: {
    margin: "18px 0",
    padding: "10px 12px",
    borderLeft: "3px solid #d98c83",
    color: "#f1c7c3",
    backgroundColor: "#2d1e1e",
    fontSize: "10px",
  },
  columnHead: {
    minHeight: "34px",
    display: "grid",
    gridTemplateColumns: "64px minmax(150px, 1.25fr) minmax(220px, 1fr) 90px 120px",
    alignItems: "center",
    gap: "16px",
    borderBottom: "1px solid #34362f",
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    "@media (max-width: 980px)": { display: "none" },
  },
  list: { margin: 0, padding: 0, listStyle: "none" },
  item: {
    minHeight: "104px",
    paddingBlock: "12px",
    display: "grid",
    gridTemplateColumns: "64px minmax(150px, 1.25fr) minmax(220px, 1fr) 90px 120px",
    alignItems: "center",
    gap: "16px",
    borderBottom: "1px solid #34362f",
    "@media (max-width: 980px)": {
      gridTemplateColumns: "54px minmax(0, 1fr) auto",
    },
  },
  grid: {
    paddingBlock: "24px 34px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "30px 18px",
    borderBottom: "1px solid #34362f",
  },
  tile: {
    minHeight: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    alignItems: "start",
    alignContent: "start",
    gap: 0,
    borderBottom: 0,
    "@media (max-width: 980px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  artwork: {
    width: "100%",
    color: "inherit",
    textDecoration: "none",
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "4px",
    },
  },
  protectedMark: { color: colors.accent, fontSize: "24px" },
  identity: { minWidth: 0, display: "grid", gap: "7px" },
  tileIdentity: { padding: "13px 3px 0" },
  name: {
    overflow: "hidden",
    color: "#f4f1e8",
    fontSize: "13px",
    fontWeight: 400,
    lineHeight: 1.25,
    textDecoration: "none",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ":hover": { color: colors.accent },
  },
  printing: { color: "#85887e", fontSize: "8px", lineHeight: 1.45 },
  properties: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "5px",
    color: "#b8baaf",
    fontSize: "8px",
    textTransform: "uppercase",
    "@media (max-width: 980px)": { gridColumn: "2 / -1" },
  },
  tileProperties: {
    marginTop: "10px",
    gridColumn: "auto",
    "@media (max-width: 980px)": { gridColumn: "auto" },
  },
  quantity: { display: "grid", gap: "2px" },
  tileQuantity: { marginTop: "13px", display: "flex", alignItems: "baseline", gap: "6px" },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "4px",
    "@media (max-width: 980px)": { gridColumn: "2 / -1", justifyContent: "flex-start" },
  },
  tileActions: {
    marginTop: "10px",
    gridColumn: "auto",
    justifyContent: "flex-start",
    "@media (max-width: 980px)": { gridColumn: "auto" },
  },
  action: {
    minHeight: "30px",
    paddingInline: "9px",
    border: "1px solid #43463e",
    borderRadius: "2px",
    color: "#b8baaf",
    backgroundColor: "transparent",
    fontSize: "7px",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    ":hover": { borderColor: colors.accent, color: "#f4f1e8" },
    ":disabled": { opacity: 0.45, cursor: "not-allowed" },
  },
  removeAction: { ":hover": { borderColor: "#d98c83", color: "#f1c7c3" } },
  readOnly: { color: "#6f7269", fontSize: "7px", textTransform: "uppercase" },
});
