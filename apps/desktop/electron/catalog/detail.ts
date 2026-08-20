import type { DatabaseSync } from "node:sqlite";

import {
  normalizeScryfallCardDetail,
  type CatalogImageDescriptor,
} from "@mooligan/domain/catalog-detail";
import {
  ScryfallCardDownloadSchema,
  type ScryfallCardDownload,
} from "@mooligan/domain/catalog-sync";
import {
  type CatalogPrintingResult,
  type CatalogSetSymbolDescriptor,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import * as z from "zod";
import type { JSONType } from "zod";

import { createCatalogReleaseSummaryQuery } from "./release.ts";
import {
  catalogVisibilityArguments,
  catalogVisibilityReason,
  catalogVisibilitySql,
  effectiveReleaseDateSql,
} from "./visibility.ts";

export const maxCatalogPrintingIdLength = 128;

const catalogOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const CatalogVisibleRecordRowSchema = z.object({
  json: z.string(),
  oracleId: z.string().nullable(),
  printingId: z.string().min(1),
  releasedOn: z.iso.date().nullable(),
  rootSetId: z.string().min(1),
});
const CatalogRelatedRecordRowSchema = z.object({ json: z.string() });
const CatalogProtectedRecordRowSchema = CatalogVisibleRecordRowSchema.omit({
  json: true,
  oracleId: true,
});
const CatalogImageRecordRowSchema = z.object({ json: z.string() });
const CatalogSetSymbolSourceRowSchema = z.object({ sourceUrl: z.url() });
const CatalogPrintingIdSchema = z.string().trim().min(1).max(maxCatalogPrintingIdLength);

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
    const selectedRow = CatalogVisibleRecordRowSchema.safeParse(selectedValue);

    if (!selectedRow.success) {
      if (selectedValue !== undefined) {
        throw new Error("The local card catalog contains an invalid card row.");
      }

      const protectedValue = selectProtectedPrinting.get(printingId);
      if (protectedValue === undefined) {
        return null;
      }
      const protectedRow = CatalogProtectedRecordRowSchema.safeParse(protectedValue);
      if (!protectedRow.success) {
        throw new Error("The local card catalog contains an invalid card row.");
      }
      const reason = catalogVisibilityReason(visibility, protectedRow.data);
      if (reason !== null || protectedRow.data.releasedOn === null) {
        throw new Error("The local card catalog returned inconsistent preview visibility.");
      }

      return {
        printingId: protectedRow.data.printingId,
        release: queryReleaseSummary(protectedRow.data.rootSetId, visibility.currentDate),
        releasedOn: protectedRow.data.releasedOn,
        status: "protected",
      };
    }

    const selected = parseCatalogRecord(selectedRow.data.json);
    const related = selectedRow.data.oracleId
      ? z
          .array(CatalogRelatedRecordRowSchema)
          .parse(selectRelated.all(selectedRow.data.oracleId, ...visibilityArguments))
          .map((row) => parseCatalogRecord(row.json))
          .sort(comparePrintings)
      : [];
    const detail = normalizeScryfallCardDetail(selected, related);
    const reason = catalogVisibilityReason(visibility, selectedRow.data);
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
              release: queryReleaseSummary(selectedRow.data.rootSetId, visibility.currentDate),
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
    const row = CatalogImageRecordRowSchema.safeParse(value);
    if (!row.success) {
      throw new Error("The local card catalog contains an invalid card row.");
    }

    const card = parseCatalogRecord(row.data.json);
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
    const row = CatalogSetSymbolSourceRowSchema.safeParse(value);
    if (!row.success) {
      throw new Error("The local card catalog contains an invalid set symbol row.");
    }
    return row.data.sourceUrl;
  };
}

export function validateCatalogPrintingId(value: JSONType) {
  const printingId = CatalogPrintingIdSchema.safeParse(value);
  return printingId.success ? printingId.data : null;
}

function parseCatalogRecord(value: string) {
  return ScryfallCardDownloadSchema.parse(JSON.parse(value));
}

function comparePrintings(left: ScryfallCardDownload, right: ScryfallCardDownload) {
  return (
    (right.released_at ?? "").localeCompare(left.released_at ?? "") ||
    catalogOrder.compare(left.set, right.set) ||
    catalogOrder.compare(left.collector_number, right.collector_number) ||
    catalogOrder.compare(left.id, right.id)
  );
}
