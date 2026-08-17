import type { DatabaseSync } from "node:sqlite";

import {
  CatalogCardDetailSchema,
  CatalogImageDescriptorSchema,
} from "@mooligan/domain/catalog-detail";
import * as z from "zod";
import type { JSONType } from "zod";

const catalogPrintingIdSchema = z.string().min(1).max(128);

export const CatalogCardSummarySchema = z.object({
  collectorNumber: z.string(),
  id: catalogPrintingIdSchema,
  image: CatalogImageDescriptorSchema.nullable(),
  name: z.string(),
  rarity: z.string(),
  setCode: z.string(),
  setName: z.string(),
  typeLine: z.string(),
});
export type CatalogCardSummary = z.infer<typeof CatalogCardSummarySchema>;

export const CatalogListRequestSchema = z.strictObject({
  includeArtSeries: z.boolean().optional(),
  includeDigital: z.boolean().optional(),
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().nonnegative().optional(),
  query: z.string().max(500).optional(),
  uniqueCards: z.boolean().optional(),
  universe: z.enum(["beyond", "within"]).optional(),
});
export type CatalogListRequest = z.infer<typeof CatalogListRequestSchema>;

export const CatalogListPageSchema = z.object({
  cards: z.array(CatalogCardSummarySchema),
  hasMore: z.boolean(),
  total: z.number().int().nonnegative().nullable(),
});
export type CatalogListPage = z.infer<typeof CatalogListPageSchema>;

const CatalogQueryOperationSchema = z.discriminatedUnion("type", [
  z.object({ printingId: catalogPrintingIdSchema, type: z.literal("detail") }),
  z.object({
    image: CatalogImageDescriptorSchema.extend({ printingId: catalogPrintingIdSchema }),
    type: z.literal("image-source"),
  }),
  z.object({ request: CatalogListRequestSchema, type: z.literal("list") }),
]);
export type CatalogQueryOperation = z.infer<typeof CatalogQueryOperationSchema>;

const CatalogQueryWorkerRequestSchema = z.object({
  id: z.number().int().positive(),
  operation: CatalogQueryOperationSchema,
});
export type CatalogQueryWorkerRequest = z.infer<typeof CatalogQueryWorkerRequestSchema>;

const CatalogQueryWorkerResponseSchema = z.union([
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("detail"),
    result: CatalogCardDetailSchema.nullable(),
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("image-source"),
    result: z.string().min(1).nullable(),
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("list"),
    result: CatalogListPageSchema,
  }),
  z.object({
    error: z.string().min(1),
    id: z.number().int().positive(),
    operation: z.enum(["detail", "image-source", "list"]),
  }),
]);
export type CatalogQueryWorkerResponse = z.infer<typeof CatalogQueryWorkerResponseSchema>;

export function parseCatalogQueryWorkerRequest(value: JSONType) {
  const request = CatalogQueryWorkerRequestSchema.safeParse(value);
  return request.success ? request.data : null;
}

export function parseCatalogQueryWorkerResponse(
  value: JSONType,
  expectedOperation: CatalogQueryOperation["type"],
) {
  const response = CatalogQueryWorkerResponseSchema.safeParse(value);
  return response.success && response.data.operation === expectedOperation ? response.data : null;
}

const cardColumns = `cards.id,
                     cards.name,
                     CASE WHEN COALESCE(
                       json_extract(cards.json, '$.image_uris.small'),
                       json_extract(cards.json, '$.card_faces[0].image_uris.small')
                     ) IS NULL THEN 0 ELSE 1 END AS hasImage,
                     cards.set_code AS setCode,
                     cards.set_name AS setName,
                     cards.collector_number AS collectorNumber,
                     cards.type_line AS typeLine,
                     cards.rarity`;
const summaryColumns = "id, name, hasImage, setCode, setName, collectorNumber, typeLine, rarity";
const artSeriesFilter = "? OR COALESCE(json_extract(cards.json, '$.layout'), '') <> 'art_series'";
const digitalFilter = "? OR COALESCE(json_extract(cards.json, '$.digital'), 0) = 0";
const universesBeyond = `EXISTS (
  SELECT 1
  FROM json_each(cards.json, '$.promo_types')
  WHERE value = 'universesbeyond'
)`;
const universeFilter = `? = '' OR (${universesBeyond}) = (? = 'beyond')`;
const cardFilter = `(${artSeriesFilter}) AND (${digitalFilter}) AND (${universeFilter})`;

export function createCatalogQuery(database: DatabaseSync) {
  const browse = database.prepare(
    `SELECT ${cardColumns}
     FROM cards
     WHERE ${cardFilter}
     ORDER BY cards.name COLLATE NOCASE,
              cards.set_code COLLATE NOCASE,
              cards.collector_number COLLATE NOCASE
     LIMIT ? OFFSET ?`,
  );
  const search = database.prepare(
    `SELECT ${cardColumns}
     FROM card_search
     JOIN cards ON cards.rowid = card_search.rowid
     WHERE card_search MATCH ? AND (${cardFilter})
     ORDER BY rank
     LIMIT ? OFFSET ?`,
  );
  const browseUniqueCards = database.prepare(
    `WITH ranked AS (
       SELECT ${cardColumns},
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(cards.oracle_id, cards.id)
                ORDER BY cards.set_code COLLATE NOCASE,
                         cards.collector_number COLLATE NOCASE,
                         cards.id
              ) AS printingRank
       FROM cards
       WHERE ${cardFilter}
     )
     SELECT ${summaryColumns}
     FROM ranked
     WHERE printingRank = 1
     ORDER BY name COLLATE NOCASE,
              setCode COLLATE NOCASE,
              collectorNumber COLLATE NOCASE
     LIMIT ? OFFSET ?`,
  );
  const searchUniqueCards = database.prepare(
    `WITH matches AS (
       SELECT ${cardColumns},
              cards.oracle_id AS oracleId,
              card_search.rank AS searchRank
       FROM card_search
       JOIN cards ON cards.rowid = card_search.rowid
       WHERE card_search MATCH ? AND (${cardFilter})
     ), ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(oracleId, id)
                ORDER BY searchRank,
                         setCode COLLATE NOCASE,
                         collectorNumber COLLATE NOCASE,
                         id
              ) AS printingRank
       FROM matches
     )
     SELECT ${summaryColumns}
     FROM ranked
     WHERE printingRank = 1
     ORDER BY searchRank,
              name COLLATE NOCASE,
              setCode COLLATE NOCASE,
              collectorNumber COLLATE NOCASE
     LIMIT ? OFFSET ?`,
  );
  const catalogTotal = database.prepare(
    "SELECT card_count AS total FROM catalog_meta WHERE singleton = 1",
  );
  const nonArtSeriesTotal = database.prepare(
    "SELECT COUNT(*) AS total FROM cards WHERE COALESCE(json_extract(json, '$.layout'), '') <> 'art_series'",
  );
  const uniqueCardTotal = database.prepare(
    `SELECT COUNT(DISTINCT COALESCE(oracle_id, id)) AS total
     FROM cards
     WHERE ${artSeriesFilter}`,
  );

  return (input: CatalogListRequest = {}): CatalogListPage => {
    const request = validateCatalogListRequest(input);
    const limit =
      Number.isSafeInteger(request.limit) && request.limit! > 0
        ? Math.min(request.limit!, 250)
        : 100;
    const offset =
      Number.isSafeInteger(request.offset) && request.offset! >= 0 ? request.offset! : 0;
    const query = request.query?.trim().slice(0, 100) ?? "";
    const ftsQuery = toFtsQuery(query);
    const includeArtSeries = request.includeArtSeries !== false;
    const includeDigital = request.includeDigital !== false;
    const uniqueCards = request.uniqueCards === true;
    const universe = request.universe ?? "";
    const filterArguments = [Number(includeArtSeries), Number(includeDigital), universe, universe];

    if (query && !ftsQuery) {
      return { cards: [], hasMore: false, total: 0 };
    }

    const statement = uniqueCards
      ? ftsQuery
        ? searchUniqueCards
        : browseUniqueCards
      : ftsQuery
        ? search
        : browse;
    const rows = z
      .array(CatalogCardSummaryRowSchema)
      .parse(
        ftsQuery
          ? statement.all(ftsQuery, ...filterArguments, limit + 1, offset)
          : statement.all(...filterArguments, limit + 1, offset),
      );
    const hasMore = rows.length > limit;
    const cards = rows.slice(0, limit).map(toCatalogCardSummary);
    const total =
      ftsQuery || !includeDigital || universe
        ? hasMore
          ? null
          : offset + cards.length
        : CatalogTotalRowSchema.parse(
            uniqueCards
              ? uniqueCardTotal.get(Number(includeArtSeries))
              : !includeArtSeries
                ? nonArtSeriesTotal.get()
                : catalogTotal.get(),
          ).total;

    return { cards, hasMore, total };
  };
}

const CatalogCardSummaryRowSchema = CatalogCardSummarySchema.omit({ image: true }).extend({
  hasImage: z.union([z.literal(0), z.literal(1)]),
});
type CatalogCardSummaryRow = z.infer<typeof CatalogCardSummaryRowSchema>;

const CatalogTotalRowSchema = z.object({ total: z.number().int().nonnegative() });

function toCatalogCardSummary(row: CatalogCardSummaryRow): CatalogCardSummary {
  const { hasImage, ...card } = row;

  return {
    ...card,
    image: hasImage
      ? CatalogImageDescriptorSchema.parse({
          faceIndex: 0,
          printingId: row.id,
          size: "small",
        })
      : null,
  };
}

export function validateCatalogListRequest(
  value: CatalogListRequest | JSONType | undefined,
): CatalogListRequest {
  if (value === undefined) {
    return {};
  }

  return CatalogListRequestSchema.parse(value);
}

function toFtsQuery(query: string) {
  return (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((term) => `"${term}"*`).join(" AND ");
}
