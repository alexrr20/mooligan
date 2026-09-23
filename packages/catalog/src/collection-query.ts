import type { CatalogDatabase } from "./database.ts";

import {
  CollectionListRequestSchema,
  CollectionSetOptionSchema,
  VisibleCollectionHoldingSchema,
  UnavailableCollectionHoldingSchema,
  ProtectedCollectionHoldingSchema,
  type CollectionHolding,
  type CollectionListPage,
  type CollectionListRequest,
} from "@mooligan/domain/collection";
import { FinishSchema } from "@mooligan/domain/catalog";
import { Schema } from "effect";
import type { JsonValue } from "@mooligan/domain/schema";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";
import { catalogVisibilityParameters, catalogVisibilitySql } from "@mooligan/catalog/visibility";

const CollectionHoldingRowSchema = Schema.Union(
  Schema.Struct({
    ...VisibleCollectionHoldingSchema.omit("image", "gridImage").fields,
    availableFinishes: Schema.parseJson(Schema.Array(FinishSchema)),
    hasImage: Schema.Literal(0, 1),
    hasGridImage: Schema.Literal(0, 1),
  }),
  Schema.Struct(UnavailableCollectionHoldingSchema.omit("label").fields),
  Schema.Struct(ProtectedCollectionHoldingSchema.omit("label").fields),
);
type CollectionHoldingRow = typeof CollectionHoldingRowSchema.Type;
const decodeCollectionHoldingRows = Schema.decodeUnknownSync(
  Schema.Array(CollectionHoldingRowSchema),
);
const decodeCollectionListRequest = Schema.decodeUnknownSync(CollectionListRequestSchema);
const decodeCollectionSummaryRow = Schema.decodeUnknownSync(
  Schema.Struct({
    filteredCards: Schema.NonNegativeInt,
    filteredCopies: Schema.NonNegativeInt,
    filteredHoldings: Schema.NonNegativeInt,
    totalCards: Schema.NonNegativeInt,
    totalCopies: Schema.NonNegativeInt,
    totalHoldings: Schema.NonNegativeInt,
    protectedCopies: Schema.NonNegativeInt,
    sets: Schema.parseJson(Schema.Array(CollectionSetOptionSchema)),
  }),
);

const collectionOrderSql = `CASE WHEN status = 'protected' THEN 1 ELSE 0 END,
  CASE WHEN $sort = 'quantity' THEN quantity END DESC,
  CASE WHEN $sort = 'set' THEN setName END COLLATE NOCASE,
  CASE WHEN $sort = 'set' THEN collectorNumber END COLLATE NOCASE,
  CASE status WHEN 'visible' THEN 0 WHEN 'unavailable' THEN 1 ELSE 2 END,
  name COLLATE NOCASE,
  setCode COLLATE NOCASE,
  collectorNumber COLLATE NOCASE,
  finish,
  language,
  condition,
  printingId`;

const collectionRowsSql = `
      WITH holdings AS (
        SELECT printing_id AS printingId,
               finish,
               language,
               condition,
               SUM(quantity) AS quantity,
               CASE WHEN COUNT(*) = 1
                          AND MAX(acquired_at) IS NULL
                          AND MAX(unit_cost_amount_minor) IS NULL
                          AND MAX(unit_cost_currency) IS NULL
                          AND MAX(location_id) IS NULL
                          AND MAX(notes) IS NULL
                    THEN MIN(id)
                    ELSE NULL
               END AS editableLotId
        FROM collection_lots
        GROUP BY printing_id, finish, language, condition
      ), enriched AS (
        SELECT holdings.*,
               CASE WHEN cards.id IS NULL THEN 'unavailable'
                    WHEN ${catalogVisibilitySql} THEN 'visible'
                    ELSE 'protected'
               END AS status,
               cards.identity_id AS cardId,
               cards.name,
               cards.set_code AS setCode,
               cards.set_name AS setName,
               cards.collector_number AS collectorNumber,
               CASE WHEN COALESCE(
                 json_extract(cards.json, '$.image_uris.thumb'),
                 json_extract(cards.json, '$.card_faces[0].image_uris.thumb')
               ) IS NULL THEN 0 ELSE 1 END AS hasImage,
               CASE WHEN COALESCE(
                 json_extract(cards.json, '$.image_uris.grid'),
                 json_extract(cards.json, '$.card_faces[0].image_uris.grid')
               ) IS NULL THEN 0 ELSE 1 END AS hasGridImage,
               CASE WHEN json_type(cards.json, '$.finishes') = 'array'
                    THEN json_extract(cards.json, '$.finishes')
                    ELSE '[]'
               END AS availableFinishes,
               COALESCE(json_extract(cards.json, '$.digital'), 0) AS isDigital
        FROM holdings
        LEFT JOIN cards ON cards.id = holdings.printingId
      ), filtered AS (
        SELECT *
        FROM enriched
        WHERE status = 'protected'
           OR (
             status <> 'protected'
             AND ($query = '' OR (status = 'visible' AND name LIKE '%' || $query || '%' COLLATE NOCASE))
             AND ($setCode = '' OR (status = 'visible' AND setCode = $setCode COLLATE NOCASE))
             AND ($finish = '' OR finish = $finish)
             AND ($language = '' OR language = $language)
             AND ($condition = '' OR condition = $condition)
           )
      )`;

export function createCollectionQuery(database: CatalogDatabase) {
  const selectPage = database.prepare(`${collectionRowsSql}
SELECT page.status,
             CASE WHEN page.status = 'protected' THEN NULL ELSE page.printingId END AS printingId,
             page.printingId AS routePrintingId,
             CASE WHEN page.status = 'protected' THEN NULL ELSE page.finish END AS finish,
             CASE WHEN page.status = 'protected' THEN NULL ELSE page.language END AS language,
             CASE WHEN page.status = 'protected' THEN NULL ELSE page.condition END AS condition,
             page.quantity,
             CASE WHEN page.status = 'visible' AND page.isDigital = 0
                       AND EXISTS (SELECT 1 FROM json_each(page.availableFinishes)
                                  WHERE value = page.finish)
                  THEN page.editableLotId
                  WHEN page.status = 'unavailable' THEN page.editableLotId
                  ELSE NULL
             END AS editableLotId,
             CASE WHEN page.status = 'visible' THEN page.cardId ELSE NULL END AS cardId,
             CASE WHEN page.status = 'visible' THEN page.name ELSE NULL END AS name,
             CASE WHEN page.status = 'visible' THEN page.setCode ELSE NULL END AS setCode,
             CASE WHEN page.status = 'visible' THEN page.setName ELSE NULL END AS setName,
             CASE WHEN page.status = 'visible' THEN page.collectorNumber ELSE NULL END AS collectorNumber,
             CASE WHEN page.status = 'visible' THEN page.hasImage ELSE NULL END AS hasImage,
             CASE WHEN page.status = 'visible' THEN page.hasGridImage ELSE NULL END AS hasGridImage,
             CASE WHEN page.status = 'visible' THEN page.availableFinishes ELSE NULL END AS availableFinishes
      FROM filtered AS page
      ORDER BY ${collectionOrderSql}
      LIMIT $limit OFFSET $offset
  `);
  const selectSummary = database.prepare(`${collectionRowsSql}
    SELECT totals.*, matching.*,
           (SELECT json_group_array(json_object('code', setCode, 'name', setName))
            FROM (SELECT DISTINCT setCode, setName FROM enriched
                  WHERE status = 'visible'
                  ORDER BY setName COLLATE NOCASE, setCode COLLATE NOCASE)) AS sets
    FROM (
      SELECT COALESCE(SUM(CASE WHEN status <> 'protected' THEN quantity ELSE 0 END), 0) AS totalCopies,
             COUNT(DISTINCT CASE WHEN status <> 'protected' THEN COALESCE(cardId, printingId) END) AS totalCards,
             COUNT(CASE WHEN status <> 'protected' THEN 1 END) AS totalHoldings,
             COALESCE(SUM(CASE WHEN status = 'protected' THEN quantity ELSE 0 END), 0) AS protectedCopies
      FROM enriched
    ) AS totals
    CROSS JOIN (
      SELECT COALESCE(SUM(quantity), 0) AS filteredCopies,
             COUNT(DISTINCT COALESCE(cardId, printingId)) AS filteredCards,
             COUNT(*) AS filteredHoldings
      FROM filtered WHERE status <> 'protected'
    ) AS matching
  `);

  return (
    input: CollectionListRequest = {},
    visibility: SpoilerVisibilitySnapshot,
  ): CollectionListPage => {
    const request = decodeCollectionListRequest(input);
    const limit = request.limit ?? 100;
    const parameters = {
      ...catalogVisibilityParameters(visibility),
      $query: request.query?.trim() ?? "",
      $setCode: request.setCode?.trim() ?? "",
      $finish: request.finish ?? "",
      $language: request.language ?? "",
      $condition: request.condition ?? "",
    };
    database.exec("BEGIN");
    try {
      const rows = decodeCollectionHoldingRows(
        selectPage.all({
          ...parameters,
          $sort: request.sort ?? "name",
          $limit: limit + 1,
          $offset: request.offset ?? 0,
        }),
      );
      const summary = decodeCollectionSummaryRow(selectSummary.get(parameters));
      database.exec("COMMIT");
      return {
        filtered: {
          cards: summary.filteredCards,
          copies: summary.filteredCopies,
          holdings: summary.filteredHoldings,
        },
        total: {
          cards: summary.totalCards,
          copies: summary.totalCopies,
          holdings: summary.totalHoldings,
        },
        hasMore: rows.length > limit,
        holdings: rows.slice(0, limit).map(toCollectionHolding),
        protectedCopies: summary.protectedCopies,
        sets: summary.sets,
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  };
}

export function validateCollectionListRequest(
  value: CollectionListRequest | JsonValue | undefined,
) {
  return decodeCollectionListRequest(value ?? {});
}

function toCollectionHolding(row: CollectionHoldingRow): CollectionHolding {
  if (row.status === "protected") return { ...row, label: "Protected preview" };
  if (row.status === "unavailable") return { ...row, label: "Unavailable printing" };
  const { hasImage, hasGridImage, ...holding } = row;
  return {
    ...holding,
    image: hasImage ? { faceIndex: 0, printingId: row.printingId, size: "thumb" } : null,
    gridImage: hasGridImage ? { faceIndex: 0, printingId: row.printingId, size: "grid" } : null,
  };
}
