import type { CatalogDatabase as DatabaseSync } from "./database.ts";

import {
  normalizeScryfallCardDetail,
  type CatalogImageDescriptor,
} from "@mooligan/domain/catalog-detail";
import {
  ScryfallCardDownloadSchema,
  type ScryfallCardDownload,
} from "@mooligan/domain/catalog-download";
import {
  type CatalogPrintingResult,
  type CatalogSetSymbolDescriptor,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import { IsoDateSchema, type JsonValue, UrlSchema } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

import { createCatalogReleaseSummaryQuery } from "@mooligan/catalog/release";
import {
  catalogVisibilityArguments,
  catalogVisibilityReason,
  catalogVisibilitySql,
  effectiveReleaseDateSql,
} from "@mooligan/catalog/visibility";

export const maxCatalogPrintingIdLength = 128;

const catalogOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const CatalogVisibleRecordRowSchema = Schema.Struct({
  json: Schema.String,
  oracleId: Schema.NullOr(Schema.String),
  printingId: Schema.NonEmptyString,
  releasedOn: Schema.NullOr(IsoDateSchema),
  rootSetId: Schema.NonEmptyString,
});
const CatalogRecordRowSchema = Schema.Struct({ json: Schema.String });
const decodeVisibleRecordRow = Schema.decodeUnknownOption(CatalogVisibleRecordRowSchema);
const decodeRelatedRecordRows = Schema.decodeUnknownSync(Schema.Array(CatalogRecordRowSchema));
const decodeProtectedRecordRow = Schema.decodeUnknownOption(
  CatalogVisibleRecordRowSchema.omit("json", "oracleId"),
);
const decodeImageRecordRow = Schema.decodeUnknownOption(CatalogRecordRowSchema);
const decodeSetSymbolSourceRow = Schema.decodeUnknownOption(
  Schema.Struct({ sourceUrl: UrlSchema }),
);
const decodeCatalogPrintingId = Schema.decodeUnknownOption(
  Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(maxCatalogPrintingIdLength)),
);
const decodeCatalogRecord = Schema.decodeUnknownSync(Schema.parseJson(ScryfallCardDownloadSchema));

export function createCatalogDetailQuery(database: DatabaseSync) {
  const selectVisiblePrinting = database.prepare(
    `SELECT cards.oracle_id AS oracleId,
            cards.json,
            cards.id AS printingId,
            ${effectiveReleaseDateSql} AS releasedOn,
            cards.root_set_id AS rootSetId
     FROM cards
     WHERE cards.id = ? AND ${catalogVisibilitySql}`,
  );
  const selectProtectedPrinting = database.prepare(
    `SELECT cards.id AS printingId,
            ${effectiveReleaseDateSql} AS releasedOn,
            cards.root_set_id AS rootSetId
     FROM cards
     WHERE cards.id = ?`,
  );
  const selectRelated = database.prepare(
    `SELECT cards.json
     FROM cards
     WHERE cards.oracle_id = ? AND ${catalogVisibilitySql}`,
  );
  const queryReleaseSummary = createCatalogReleaseSummaryQuery(database);

  return (
    printingId: string,
    visibility: SpoilerVisibilitySnapshot,
  ): CatalogPrintingResult | null => {
    const visibilityArguments = catalogVisibilityArguments(visibility);
    const selectedValue = selectVisiblePrinting.get(printingId, ...visibilityArguments);
    const selectedRow = decodeVisibleRecordRow(selectedValue);

    if (Option.isNone(selectedRow)) {
      if (selectedValue !== undefined) {
        throw new Error("The local card catalog contains an invalid card row.");
      }

      const protectedValue = selectProtectedPrinting.get(printingId);
      if (protectedValue === undefined) {
        return null;
      }
      const protectedRow = decodeProtectedRecordRow(protectedValue);
      if (Option.isNone(protectedRow)) {
        throw new Error("The local card catalog contains an invalid card row.");
      }
      const reason = catalogVisibilityReason(visibility, protectedRow.value);
      if (reason !== null || protectedRow.value.releasedOn === null) {
        throw new Error("The local card catalog returned inconsistent preview visibility.");
      }

      return {
        printingId: protectedRow.value.printingId,
        release: queryReleaseSummary(protectedRow.value.rootSetId, visibility.currentDate),
        releasedOn: protectedRow.value.releasedOn,
        status: "protected",
      };
    }

    const selected = decodeCatalogRecord(selectedRow.value.json);
    const related = selectedRow.value.oracleId
      ? decodeRelatedRecordRows(
          selectRelated.all(selectedRow.value.oracleId, ...visibilityArguments),
        )
          .map((row) => decodeCatalogRecord(row.json))
          .sort(comparePrintings)
      : [];
    const detail = normalizeScryfallCardDetail(selected, related);
    const reason = catalogVisibilityReason(visibility, selectedRow.value);
    if (reason === null) {
      throw new Error("The local card catalog returned inconsistent preview visibility.");
    }

    return {
      detail,
      status: "visible",
      visibility:
        reason === "released"
          ? { reason }
          : {
              reason,
              release: queryReleaseSummary(selectedRow.value.rootSetId, visibility.currentDate),
            },
    };
  };
}

export function createCatalogImageSourceQuery(database: DatabaseSync) {
  const selectPrinting = database.prepare(
    `SELECT cards.json
     FROM cards
     WHERE cards.id = ? AND ${catalogVisibilitySql}`,
  );

  return (input: CatalogImageDescriptor, visibility: SpoilerVisibilitySnapshot): string | null => {
    const value = selectPrinting.get(input.printingId, ...catalogVisibilityArguments(visibility));
    if (value === undefined) {
      return null;
    }
    const row = decodeImageRecordRow(value);
    if (Option.isNone(row)) {
      throw new Error("The local card catalog contains an invalid card row.");
    }

    const card = decodeCatalogRecord(row.value.json);
    const usesFaceImages = card.card_faces?.some((face) => face.image_uris) === true;

    if (usesFaceImages) {
      return card.card_faces?.[input.faceIndex]?.image_uris?.[input.size] ?? null;
    }

    return input.faceIndex === 0 ? (card.image_uris?.[input.size] ?? null) : null;
  };
}

export function createCatalogSetSymbolSourceQuery(database: DatabaseSync) {
  const selectSymbol = database.prepare("SELECT symbol_uri AS sourceUrl FROM sets WHERE id = ?");

  return (input: CatalogSetSymbolDescriptor): string | null => {
    const value = selectSymbol.get(input.setId);
    if (value === undefined) {
      return null;
    }
    const row = decodeSetSymbolSourceRow(value);
    if (Option.isNone(row)) {
      throw new Error("The local card catalog contains an invalid set symbol row.");
    }
    return row.value.sourceUrl;
  };
}

export function validateCatalogPrintingId(value: JsonValue) {
  return Option.getOrNull(decodeCatalogPrintingId(value));
}

function comparePrintings(left: ScryfallCardDownload, right: ScryfallCardDownload) {
  return (
    (right.released_at ?? "").localeCompare(left.released_at ?? "") ||
    catalogOrder.compare(left.set, right.set) ||
    catalogOrder.compare(left.collector_number, right.collector_number) ||
    catalogOrder.compare(left.id, right.id)
  );
}
