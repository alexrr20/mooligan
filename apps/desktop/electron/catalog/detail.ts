import type { DatabaseSync, StatementSync } from "node:sqlite";

import {
  CatalogImageDescriptorSchema,
  normalizeScryfallCardDetail,
  type CatalogCardDetail,
  type CatalogImageDescriptor,
} from "@mooligan/domain/catalog-detail";
import {
  ScryfallCardDownloadSchema,
  type ScryfallCardDownload,
} from "@mooligan/domain/catalog-sync";
import * as z from "zod";
import type { JSONType } from "zod";

export const maxCatalogPrintingIdLength = 128;

const catalogOrder = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const CatalogRecordRowSchema = z.object({
  json: z.string(),
  oracleId: z.string().nullable(),
});
const CatalogPrintingIdSchema = z.string().trim().min(1).max(maxCatalogPrintingIdLength);

export function createCatalogDetailQuery(database: DatabaseSync) {
  const selectPrinting = database.prepare(
    "SELECT oracle_id AS oracleId, json FROM cards WHERE id = ?",
  );
  const selectRelated = database.prepare(
    "SELECT oracle_id AS oracleId, json FROM cards WHERE oracle_id = ?",
  );

  return (printingId: string): CatalogCardDetail | null => {
    const validPrintingId = validateCatalogPrintingId(printingId);
    if (!validPrintingId) {
      return null;
    }

    const selectedRow = readCatalogRow(selectPrinting, validPrintingId);
    if (!selectedRow) {
      return null;
    }

    const selected = parseCatalogRecord(selectedRow.json);
    const related = selectedRow.oracleId
      ? z
          .array(CatalogRecordRowSchema)
          .parse(selectRelated.all(selectedRow.oracleId))
          .map((row) => parseCatalogRecord(row.json))
          .sort(comparePrintings)
      : [];

    return normalizeScryfallCardDetail(selected, related);
  };
}

export function createCatalogImageSourceQuery(database: DatabaseSync) {
  const selectPrinting = database.prepare(
    "SELECT oracle_id AS oracleId, json FROM cards WHERE id = ?",
  );

  return (input: CatalogImageDescriptor): string | null => {
    const image = CatalogImageDescriptorSchema.parse(input);
    const validPrintingId = validateCatalogPrintingId(image.printingId);
    if (!validPrintingId) {
      return null;
    }

    const row = readCatalogRow(selectPrinting, validPrintingId);
    if (!row) {
      return null;
    }

    const card = parseCatalogRecord(row.json);
    const usesFaceImages = card.card_faces?.some((face) => face.image_uris) === true;

    if (usesFaceImages) {
      return card.card_faces?.[image.faceIndex]?.image_uris?.[image.size] ?? null;
    }

    return image.faceIndex === 0 ? (card.image_uris?.[image.size] ?? null) : null;
  };
}

export function validateCatalogPrintingId(value: JSONType) {
  const printingId = CatalogPrintingIdSchema.safeParse(value);
  return printingId.success ? printingId.data : null;
}

function readCatalogRow(statement: StatementSync, printingId: string) {
  const value = statement.get(printingId);

  if (value === undefined) {
    return null;
  }

  const row = CatalogRecordRowSchema.safeParse(value);
  if (!row.success) {
    throw new Error("The local card catalog contains an invalid card row.");
  }

  return row.data;
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
