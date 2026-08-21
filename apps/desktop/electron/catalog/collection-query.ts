import type { DatabaseSync } from "node:sqlite";

import {
  CollectionListPageSchema,
  CollectionListRequestSchema,
  CollectionHoldingSchema,
  type CollectionHolding,
  type CollectionListPage,
  type CollectionListRequest,
} from "@mooligan/domain/collection";
import * as z from "zod";
import type { JSONType } from "zod";

import { catalogVisibilityArguments, catalogVisibilitySql } from "./visibility.ts";
import type { SpoilerVisibilitySnapshot } from "@mooligan/domain/spoilers";

const CollectionQueryRowSchema = z.object({
  availableFinishes: z.string().nullable(),
  cardId: z.string().nullable(),
  collectorNumber: z.string().nullable(),
  condition: z.string().nullable(),
  editableLotId: z.string().nullable(),
  filteredCards: z.number().int().nonnegative().nullable(),
  filteredCopies: z.number().int().nonnegative().nullable(),
  filteredHoldings: z.number().int().nonnegative().nullable(),
  finish: z.string().nullable(),
  hasGridImage: z.union([z.literal(0), z.literal(1)]).nullable(),
  hasImage: z.union([z.literal(0), z.literal(1)]).nullable(),
  isSummary: z.union([z.literal(0), z.literal(1)]),
  language: z.string().nullable(),
  name: z.string().nullable(),
  position: z.number().int().positive().nullable(),
  printingId: z.string().nullable(),
  protectedCopies: z.number().int().nonnegative().nullable(),
  quantity: z.number().int().positive().nullable(),
  routePrintingId: z.string().nullable(),
  setCode: z.string().nullable(),
  setName: z.string().nullable(),
  sets: z.string().nullable(),
  status: z.enum(["protected", "unavailable", "visible"]).nullable(),
  totalCards: z.number().int().nonnegative().nullable(),
  totalCopies: z.number().int().nonnegative().nullable(),
  totalHoldings: z.number().int().nonnegative().nullable(),
});
type CollectionQueryRow = z.infer<typeof CollectionQueryRowSchema>;

const collectionOrderSql = `CASE WHEN status = 'protected' THEN 1 ELSE 0 END,
  CASE WHEN ? = 'quantity' THEN quantity END DESC,
  CASE WHEN ? = 'set' THEN setName END COLLATE NOCASE,
  CASE WHEN ? = 'set' THEN collectorNumber END COLLATE NOCASE,
  CASE status WHEN 'visible' THEN 0 WHEN 'unavailable' THEN 1 ELSE 2 END,
  name COLLATE NOCASE,
  setCode COLLATE NOCASE,
  collectorNumber COLLATE NOCASE,
  finish,
  language,
  condition,
  printingId`;

export function createCollectionQuery(database: DatabaseSync) {
  return (
    input: CollectionListRequest = {},
    visibility: SpoilerVisibilitySnapshot,
  ): CollectionListPage => {
    const request = CollectionListRequestSchema.parse(input);
    const query = request.query?.trim() ?? "";
    const setCode = request.setCode?.trim() ?? "";
    const finish = request.finish ?? "";
    const language = request.language ?? "";
    const condition = request.condition ?? "";
    const sort = request.sort ?? "name";
    const limit = Math.min(request.limit ?? 100, 100);
    const offset = request.offset ?? 0;
    const statement = database.prepare(`
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
        FROM workspace.collection_lots
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
             AND (? = '' OR (status = 'visible' AND name LIKE '%' || ? || '%' COLLATE NOCASE))
             AND (? = '' OR (status = 'visible' AND setCode = ? COLLATE NOCASE))
             AND (? = '' OR finish = ?)
             AND (? = '' OR language = ?)
             AND (? = '' OR condition = ?)
           )
      ), ordered AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY ${collectionOrderSql}) AS position
        FROM filtered
      ), page AS (
        SELECT * FROM ordered WHERE position > ? AND position <= ?
      ), summary AS (
        SELECT
          COALESCE((SELECT SUM(quantity) FROM enriched WHERE status <> 'protected'), 0) AS totalCopies,
          COALESCE((SELECT COUNT(DISTINCT COALESCE(cardId, printingId))
                    FROM enriched WHERE status <> 'protected'), 0) AS totalCards,
          COALESCE((SELECT COUNT(*) FROM enriched WHERE status <> 'protected'), 0) AS totalHoldings,
          COALESCE((SELECT SUM(quantity) FROM filtered WHERE status <> 'protected'), 0) AS filteredCopies,
          COALESCE((SELECT COUNT(DISTINCT COALESCE(cardId, printingId))
                    FROM filtered WHERE status <> 'protected'), 0) AS filteredCards,
          COALESCE((SELECT COUNT(*) FROM filtered WHERE status <> 'protected'), 0) AS filteredHoldings,
          COALESCE((SELECT SUM(quantity) FROM enriched WHERE status = 'protected'), 0) AS protectedCopies,
          COALESCE((SELECT json_group_array(json_object('code', setCode, 'name', setName))
                    FROM (SELECT DISTINCT setCode, setName
                          FROM enriched
                          WHERE status = 'visible'
                          ORDER BY setName COLLATE NOCASE, setCode COLLATE NOCASE)), '[]') AS sets
      )
      SELECT 0 AS isSummary,
             page.position,
             page.status,
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
             CASE WHEN page.status = 'visible' THEN page.availableFinishes ELSE NULL END AS availableFinishes,
             NULL AS totalCopies,
             NULL AS totalCards,
             NULL AS totalHoldings,
             NULL AS filteredCopies,
             NULL AS filteredCards,
             NULL AS filteredHoldings,
             NULL AS protectedCopies,
             NULL AS sets
      FROM page
      UNION ALL
      SELECT 1 AS isSummary,
             NULL AS position,
             NULL AS status,
             NULL AS printingId,
             NULL AS routePrintingId,
             NULL AS finish,
             NULL AS language,
             NULL AS condition,
             NULL AS quantity,
             NULL AS editableLotId,
             NULL AS cardId,
             NULL AS name,
             NULL AS setCode,
             NULL AS setName,
             NULL AS collectorNumber,
             NULL AS hasImage,
             NULL AS hasGridImage,
             NULL AS availableFinishes,
             summary.totalCopies,
             summary.totalCards,
             summary.totalHoldings,
             summary.filteredCopies,
             summary.filteredCards,
             summary.filteredHoldings,
             summary.protectedCopies,
             summary.sets
      FROM summary
      ORDER BY isSummary, position
    `);
    const rows = z
      .array(CollectionQueryRowSchema)
      .parse(
        statement.all(
          ...catalogVisibilityArguments(visibility),
          query,
          query,
          setCode,
          setCode,
          finish,
          finish,
          language,
          language,
          condition,
          condition,
          sort,
          sort,
          sort,
          offset,
          offset + limit + 1,
        ),
      );
    const summary = rows.at(-1);

    if (!summary || summary.isSummary !== 1) {
      throw new Error("The local Collection returned an invalid summary.");
    }

    const holdingRows = rows.slice(0, -1);
    const holdings = holdingRows.slice(0, limit).map(toCollectionHolding);
    const result = {
      filtered: {
        cards: summary.filteredCards ?? 0,
        copies: summary.filteredCopies ?? 0,
        holdings: summary.filteredHoldings ?? 0,
      },
      hasMore: holdingRows.length > limit,
      holdings,
      protectedCopies: summary.protectedCopies ?? 0,
      sets: JSON.parse(summary.sets ?? "[]"),
      total: {
        cards: summary.totalCards ?? 0,
        copies: summary.totalCopies ?? 0,
        holdings: summary.totalHoldings ?? 0,
      },
    };

    return CollectionListPageSchema.parse(result);
  };
}

export function validateCollectionListRequest(value: CollectionListRequest | JSONType | undefined) {
  return CollectionListRequestSchema.parse(value ?? {});
}

function toCollectionHolding(row: CollectionQueryRow): CollectionHolding {
  if (row.status === "protected" && row.quantity && row.routePrintingId) {
    return {
      label: "Protected preview",
      quantity: row.quantity,
      routePrintingId: row.routePrintingId,
      status: "protected",
    };
  }

  if (!row.printingId || !row.finish || !row.language || !row.condition || !row.quantity) {
    throw new Error("The local Collection returned an invalid Holding.");
  }

  const common = {
    condition: row.condition,
    editableLotId: row.editableLotId,
    finish: row.finish,
    language: row.language,
    printingId: row.printingId,
    quantity: row.quantity,
  };

  if (row.status === "unavailable") {
    return CollectionHoldingSchema.parse({
      ...common,
      label: "Unavailable printing",
      status: "unavailable",
    });
  }

  if (
    row.status !== "visible" ||
    !row.cardId ||
    !row.name ||
    !row.setCode ||
    !row.setName ||
    row.collectorNumber === null ||
    row.availableFinishes === null
  ) {
    throw new Error("The local Collection returned an invalid Holding.");
  }

  return CollectionHoldingSchema.parse({
    ...common,
    availableFinishes: JSON.parse(row.availableFinishes),
    cardId: row.cardId,
    collectorNumber: row.collectorNumber,
    gridImage: row.hasGridImage ? { faceIndex: 0, printingId: row.printingId, size: "grid" } : null,
    image: row.hasImage ? { faceIndex: 0, printingId: row.printingId, size: "thumb" } : null,
    name: row.name,
    setCode: row.setCode,
    setName: row.setName,
    status: "visible",
  });
}
