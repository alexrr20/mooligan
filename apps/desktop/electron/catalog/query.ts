import type { DatabaseSync } from "node:sqlite";

import { CatalogImageDescriptorSchema } from "@mooligan/domain/catalog-detail";
import {
  CatalogPrintingResultSchema,
  CatalogReleaseSummarySchema,
  CatalogSetSymbolDescriptorSchema,
  SpoilerRevealSummariesSchema,
  SpoilerVisibilitySnapshotSchema,
  type CatalogReleaseSummary,
  type SpoilerRevealSummary,
  type SpoilerRevealSummaries,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import * as z from "zod";
import type { JSONType } from "zod";

import { CatalogReleaseSummaryRowSchema, toCatalogReleaseSummary } from "./release.ts";
import {
  catalogVisibilityArguments,
  catalogVisibilitySql,
  catalogVisibilitySqlFor,
  effectiveReleaseDateSql,
} from "./visibility.ts";

const catalogPrintingIdSchema = z.string().min(1).max(128);

export const CatalogCardSummarySchema = z.object({
  collectorNumber: z.string(),
  gridImage: CatalogImageDescriptorSchema.nullable(),
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
  includeAdCards: z.boolean().optional(),
  includeArtSeries: z.boolean().optional(),
  includeDigital: z.boolean().optional(),
  includeTokens: z.boolean().optional(),
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

const CatalogUpcomingPrintingRequestSchema = z.strictObject({
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type CatalogUpcomingPrintingRequest = z.infer<typeof CatalogUpcomingPrintingRequestSchema>;

export const CatalogUpcomingPrintingSchema = z.discriminatedUnion("status", [
  z.strictObject({
    card: CatalogCardSummarySchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: z.iso.date(),
    status: z.literal("visible"),
  }),
  z.strictObject({
    printingId: catalogPrintingIdSchema,
    release: CatalogReleaseSummarySchema,
    releasedOn: z.iso.date(),
    status: z.literal("protected"),
  }),
]);
export type CatalogUpcomingPrinting = z.infer<typeof CatalogUpcomingPrintingSchema>;

export const CatalogUpcomingPrintingPageSchema = z.strictObject({
  hasMore: z.boolean(),
  printings: z.array(CatalogUpcomingPrintingSchema),
  total: z.number().int().nonnegative(),
});
export type CatalogUpcomingPrintingPage = z.infer<typeof CatalogUpcomingPrintingPageSchema>;

const CatalogQueryOperationSchema = z.discriminatedUnion("type", [
  z.object({
    printingId: catalogPrintingIdSchema,
    type: z.literal("detail"),
    visibility: SpoilerVisibilitySnapshotSchema,
  }),
  z.object({
    image: CatalogImageDescriptorSchema.extend({ printingId: catalogPrintingIdSchema }),
    type: z.literal("image-source"),
    visibility: SpoilerVisibilitySnapshotSchema,
  }),
  z.object({
    request: CatalogListRequestSchema,
    type: z.literal("list"),
    visibility: SpoilerVisibilitySnapshotSchema,
  }),
  z.object({
    request: CatalogUpcomingPrintingRequestSchema,
    type: z.literal("upcoming-printings"),
    visibility: SpoilerVisibilitySnapshotSchema,
  }),
  z.object({
    rootSetIds: z.array(catalogPrintingIdSchema),
    printingIds: z.array(catalogPrintingIdSchema),
    type: z.literal("spoiler-reveals"),
  }),
  z.object({ symbol: CatalogSetSymbolDescriptorSchema, type: z.literal("set-symbol-source") }),
  z.object({ targetId: catalogPrintingIdSchema, type: z.literal("root-set") }),
  z.object({ type: z.literal("upcoming"), visibility: SpoilerVisibilitySnapshotSchema }),
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
    result: CatalogPrintingResultSchema.nullable(),
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
    id: z.number().int().positive(),
    operation: z.literal("upcoming-printings"),
    result: CatalogUpcomingPrintingPageSchema,
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("root-set"),
    result: catalogPrintingIdSchema.nullable(),
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("set-symbol-source"),
    result: z.string().min(1).nullable(),
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("spoiler-reveals"),
    result: SpoilerRevealSummariesSchema,
  }),
  z.object({
    id: z.number().int().positive(),
    operation: z.literal("upcoming"),
    result: z.array(CatalogReleaseSummarySchema),
  }),
  z.object({
    error: z.string().min(1),
    id: z.number().int().positive(),
    operation: z.enum([
      "detail",
      "image-source",
      "list",
      "root-set",
      "set-symbol-source",
      "spoiler-reveals",
      "upcoming",
      "upcoming-printings",
    ]),
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
                       json_extract(cards.json, '$.image_uris.thumb'),
                       json_extract(cards.json, '$.card_faces[0].image_uris.thumb')
                     ) IS NULL THEN 0 ELSE 1 END AS hasImage,
                     CASE WHEN COALESCE(
                       json_extract(cards.json, '$.image_uris.grid'),
                       json_extract(cards.json, '$.card_faces[0].image_uris.grid')
                     ) IS NULL THEN 0 ELSE 1 END AS hasGridImage,
                     cards.set_code AS setCode,
                     cards.set_name AS setName,
                     cards.collector_number AS collectorNumber,
                     cards.type_line AS typeLine,
                     cards.rarity,
                     ${effectiveReleaseDateSql} AS releasedOn`;
const summaryColumns =
  "id, name, hasImage, hasGridImage, setCode, setName, collectorNumber, typeLine, rarity, releasedOn";
const artSeriesFilter = "? OR COALESCE(json_extract(cards.json, '$.layout'), '') <> 'art_series'";
const digitalFilter = "? OR COALESCE(json_extract(cards.json, '$.digital'), 0) = 0";
const tokenCard =
  "COALESCE(json_extract(cards.json, '$.layout'), '') IN ('token', 'double_faced_token')";
const adCard = `COALESCE(json_extract(cards.json, '$.layout'), '') = 'token'
  AND cards.type_line = 'Card'
  AND substr(cards.name, -3) = ' Ad'`;
const tokenFilter = `? OR NOT (${tokenCard}) OR (${adCard})`;
const adCardFilter = `? OR NOT (${adCard})`;
const universesBeyond = `EXISTS (
  SELECT 1
  FROM json_each(cards.json, '$.promo_types')
  WHERE value = 'universesbeyond'
)`;
const universeFilter = `? = '' OR (${universesBeyond}) = (? = 'beyond')`;
const cardFilter = `(${artSeriesFilter})
  AND (${digitalFilter})
  AND (${tokenFilter})
  AND (${adCardFilter})
  AND (${universeFilter})`;
const newerCardFilter = cardFilter.replaceAll("cards.", "newer.");
const newerCardPrecedes = `(
  COALESCE(newer.effective_released_at, '') > COALESCE(cards.effective_released_at, '')
  OR (
    COALESCE(newer.effective_released_at, '') = COALESCE(cards.effective_released_at, '')
    AND newer.set_code COLLATE NOCASE < cards.set_code COLLATE NOCASE
  )
  OR (
    COALESCE(newer.effective_released_at, '') = COALESCE(cards.effective_released_at, '')
    AND newer.set_code COLLATE NOCASE = cards.set_code COLLATE NOCASE
    AND newer.collector_number COLLATE NOCASE < cards.collector_number COLLATE NOCASE
  )
  OR (
    COALESCE(newer.effective_released_at, '') = COALESCE(cards.effective_released_at, '')
    AND newer.set_code COLLATE NOCASE = cards.set_code COLLATE NOCASE
    AND newer.collector_number COLLATE NOCASE = cards.collector_number COLLATE NOCASE
    AND newer.id < cards.id
  )
)`;

export function createCatalogQuery(database: DatabaseSync) {
  const browse = database.prepare(
    `SELECT ${cardColumns}
     FROM cards
     WHERE (${cardFilter}) AND ${catalogVisibilitySql}
     ORDER BY ${effectiveReleaseDateSql} DESC,
              cards.name COLLATE NOCASE,
              cards.set_code COLLATE NOCASE,
              cards.collector_number COLLATE NOCASE,
              cards.id
     LIMIT ? OFFSET ?`,
  );
  const search = database.prepare(
    `SELECT ${cardColumns}
     FROM card_search
     JOIN cards ON cards.rowid = card_search.rowid
     WHERE card_search MATCH ? AND (${cardFilter}) AND ${catalogVisibilitySql}
     ORDER BY ${effectiveReleaseDateSql} DESC,
              rank,
              cards.name COLLATE NOCASE,
              cards.set_code COLLATE NOCASE,
              cards.collector_number COLLATE NOCASE,
              cards.id
     LIMIT ? OFFSET ?`,
  );
  const browseUniqueCards = database.prepare(
    `SELECT ${cardColumns}
     FROM cards
     WHERE (${cardFilter})
       AND ${catalogVisibilitySql}
       AND NOT EXISTS (
         SELECT 1
         FROM cards AS newer
         WHERE newer.identity_id = cards.identity_id
           AND (${newerCardFilter})
           AND ${catalogVisibilitySqlFor("newer")}
           AND ${newerCardPrecedes}
       )
     ORDER BY ${effectiveReleaseDateSql} DESC,
              cards.name COLLATE NOCASE,
              cards.set_code COLLATE NOCASE,
              cards.collector_number COLLATE NOCASE,
              cards.id
     LIMIT ? OFFSET ?`,
  );
  const searchUniqueCards = database.prepare(
    `WITH matches AS (
       SELECT ${cardColumns},
              cards.oracle_id AS oracleId,
              card_search.rank AS searchRank
       FROM card_search
       JOIN cards ON cards.rowid = card_search.rowid
       WHERE card_search MATCH ? AND (${cardFilter}) AND ${catalogVisibilitySql}
     ), ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (
                PARTITION BY COALESCE(oracleId, id)
                ORDER BY releasedOn DESC,
                         searchRank,
                         setCode COLLATE NOCASE,
                         collectorNumber COLLATE NOCASE,
                         id
              ) AS printingRank
       FROM matches
     )
     SELECT ${summaryColumns}
     FROM ranked
     WHERE printingRank = 1
     ORDER BY releasedOn DESC,
              searchRank,
              name COLLATE NOCASE,
              setCode COLLATE NOCASE,
              collectorNumber COLLATE NOCASE,
              id
     LIMIT ? OFFSET ?`,
  );
  const catalogTotal = database.prepare(
    `SELECT COUNT(*) AS total
     FROM cards
     WHERE ${catalogVisibilitySql}`,
  );
  const fullCatalogTotal = database.prepare(
    "SELECT card_count AS total FROM catalog_meta WHERE singleton = 1",
  );
  const protectedCatalogTotal = database.prepare(
    `SELECT COUNT(*) AS total
     FROM cards
     WHERE ${effectiveReleaseDateSql} IS NULL OR ${effectiveReleaseDateSql} <= ?`,
  );
  const nonArtSeriesTotal = database.prepare(
    `SELECT COUNT(*) AS total
     FROM cards
     WHERE COALESCE(json_extract(cards.json, '$.layout'), '') <> 'art_series'
       AND ${catalogVisibilitySql}`,
  );
  const uniqueCardTotal = database.prepare(
    `SELECT COUNT(DISTINCT cards.identity_id) AS total
     FROM cards
     WHERE (${artSeriesFilter}) AND ${catalogVisibilitySql}`,
  );
  const fullUniqueCardTotal = database.prepare(
    "SELECT COUNT(DISTINCT identity_id) AS total FROM cards",
  );
  const protectedUniqueCardTotal = database.prepare(
    `SELECT COUNT(DISTINCT identity_id) AS total
     FROM cards
     WHERE ${effectiveReleaseDateSql} IS NULL OR ${effectiveReleaseDateSql} <= ?`,
  );

  return (
    input: CatalogListRequest | undefined,
    visibility: SpoilerVisibilitySnapshot,
  ): CatalogListPage => {
    const request = validateCatalogListRequest(input);
    const visibilityArguments = catalogVisibilityArguments(visibility);
    const limit =
      Number.isSafeInteger(request.limit) && request.limit! > 0
        ? Math.min(request.limit!, 250)
        : 100;
    const offset =
      Number.isSafeInteger(request.offset) && request.offset! >= 0 ? request.offset! : 0;
    const query = request.query?.trim().slice(0, 100) ?? "";
    const ftsQuery = toFtsQuery(query);
    const includeAdCards = request.includeAdCards !== false;
    const includeArtSeries = request.includeArtSeries !== false;
    const includeDigital = request.includeDigital !== false;
    const includeTokens = request.includeTokens !== false;
    const uniqueCards = request.uniqueCards === true;
    const universe = request.universe ?? "";
    const filterArguments = [
      Number(includeArtSeries),
      Number(includeDigital),
      Number(includeTokens),
      Number(includeAdCards),
      universe,
      universe,
    ];

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
          ? statement.all(ftsQuery, ...filterArguments, ...visibilityArguments, limit + 1, offset)
          : uniqueCards
            ? statement.all(
                ...filterArguments,
                ...visibilityArguments,
                ...filterArguments,
                ...visibilityArguments,
                limit + 1,
                offset,
              )
            : statement.all(...filterArguments, ...visibilityArguments, limit + 1, offset),
      );
    const hasMore = rows.length > limit;
    const cards = rows.slice(0, limit).map(toCatalogCardSummary);
    const total =
      ftsQuery || !includeAdCards || !includeDigital || !includeTokens || universe
        ? hasMore
          ? null
          : offset + cards.length
        : CatalogTotalRowSchema.parse(
            uniqueCards
              ? includeArtSeries && visibility.policy === "show"
                ? fullUniqueCardTotal.get()
                : includeArtSeries &&
                    visibility.revealedPrintingIds.length === 0 &&
                    visibility.revealedRootSetIds.length === 0
                  ? protectedUniqueCardTotal.get(visibility.currentDate)
                  : uniqueCardTotal.get(Number(includeArtSeries), ...visibilityArguments)
              : !includeArtSeries
                ? nonArtSeriesTotal.get(...visibilityArguments)
                : visibility.policy === "show"
                  ? fullCatalogTotal.get()
                  : visibility.revealedPrintingIds.length === 0 &&
                      visibility.revealedRootSetIds.length === 0
                    ? protectedCatalogTotal.get(visibility.currentDate)
                    : catalogTotal.get(...visibilityArguments),
          ).total;

    return { cards, hasMore, total };
  };
}

export function createCatalogUpcomingQuery(database: DatabaseSync) {
  const selectUpcoming = database.prepare(
    `SELECT root_sets.id AS rootSetId,
            root_sets.name,
            root_sets.code,
            MIN(${effectiveReleaseDateSql}) AS nextReleaseOn
     FROM cards
     JOIN sets AS root_sets ON root_sets.id = cards.root_set_id
     WHERE ${effectiveReleaseDateSql} > ?
     GROUP BY root_sets.id, root_sets.name, root_sets.code
     ORDER BY nextReleaseOn,
              root_sets.name COLLATE NOCASE,
              root_sets.code COLLATE NOCASE,
              root_sets.id`,
  );

  return (visibility: SpoilerVisibilitySnapshot): CatalogReleaseSummary[] => {
    const snapshot = SpoilerVisibilitySnapshotSchema.parse(visibility);
    return z
      .array(CatalogReleaseSummaryRowSchema)
      .parse(selectUpcoming.all(snapshot.currentDate))
      .map(toCatalogReleaseSummary);
  };
}

export function createCatalogUpcomingPrintingsQuery(database: DatabaseSync) {
  const selectUpcoming = database.prepare(
    `WITH upcoming AS (
       SELECT ${cardColumns},
              root_sets.id AS rootSetId,
              root_sets.name AS releaseName,
              root_sets.code AS releaseCode,
              MIN(${effectiveReleaseDateSql}) OVER (
                PARTITION BY root_sets.id
              ) AS nextReleaseOn,
              CASE WHEN ${catalogVisibilitySql} THEN 1 ELSE 0 END AS isVisible
       FROM cards
       JOIN sets AS root_sets ON root_sets.id = cards.root_set_id
       WHERE ${effectiveReleaseDateSql} > ?
     )
     SELECT id,
            CASE WHEN isVisible = 1 THEN name ELSE NULL END AS name,
            CASE WHEN isVisible = 1 THEN hasImage ELSE 0 END AS hasImage,
            CASE WHEN isVisible = 1 THEN hasGridImage ELSE 0 END AS hasGridImage,
            CASE WHEN isVisible = 1 THEN setCode ELSE NULL END AS setCode,
            CASE WHEN isVisible = 1 THEN setName ELSE NULL END AS setName,
            CASE WHEN isVisible = 1 THEN collectorNumber ELSE NULL END AS collectorNumber,
            CASE WHEN isVisible = 1 THEN typeLine ELSE NULL END AS typeLine,
            CASE WHEN isVisible = 1 THEN rarity ELSE NULL END AS rarity,
            releasedOn,
            rootSetId,
            releaseName,
            releaseCode,
            nextReleaseOn,
            isVisible
     FROM upcoming
     ORDER BY releasedOn,
              releaseName COLLATE NOCASE,
              releaseCode COLLATE NOCASE,
              id
     LIMIT ? OFFSET ?`,
  );
  const countUpcoming = database.prepare(
    `SELECT COUNT(*) AS total
     FROM cards
     WHERE ${effectiveReleaseDateSql} > ?`,
  );

  return (
    input: CatalogUpcomingPrintingRequest | undefined,
    visibility: SpoilerVisibilitySnapshot,
  ): CatalogUpcomingPrintingPage => {
    const request = validateCatalogUpcomingPrintingRequest(input);
    const snapshot = SpoilerVisibilitySnapshotSchema.parse(visibility);
    const limit = request.limit ?? 100;
    const offset = request.offset ?? 0;
    const rows = z
      .array(CatalogUpcomingPrintingRowSchema)
      .parse(
        selectUpcoming.all(
          ...catalogVisibilityArguments(snapshot),
          snapshot.currentDate,
          limit + 1,
          offset,
        ),
      );
    const total = CatalogTotalRowSchema.parse(countUpcoming.get(snapshot.currentDate)).total;

    return {
      hasMore: rows.length > limit,
      printings: rows.slice(0, limit).map(toCatalogUpcomingPrinting),
      total,
    };
  };
}

export function createCatalogRootSetQuery(database: DatabaseSync) {
  const selectRoot = database.prepare(
    `SELECT rootSetId
     FROM (
       SELECT sets.root_set_id AS rootSetId, 0 AS priority
       FROM sets
       WHERE sets.id = ?
       UNION ALL
       SELECT cards.root_set_id AS rootSetId, 1 AS priority
       FROM cards
       WHERE cards.id = ?
     )
     ORDER BY priority
     LIMIT 1`,
  );

  return (targetId: string): string | null => {
    const id = catalogPrintingIdSchema.parse(targetId);
    const row = z.object({ rootSetId: catalogPrintingIdSchema }).safeParse(selectRoot.get(id, id));
    return row.success ? row.data.rootSetId : null;
  };
}

export function createCatalogSpoilerRevealSummariesQuery(database: DatabaseSync) {
  const selectPrintings = database.prepare(
    `SELECT requested.value AS targetId,
            COALESCE(cards.name, 'Unavailable printing') AS label,
            CASE
              WHEN cards.id IS NULL THEN NULL
              ELSE sets.name || ' (' || upper(sets.code) || ') #' || cards.collector_number
            END AS detail,
            cards.root_set_id AS rootSetId
     FROM json_each(?) AS requested
     LEFT JOIN cards ON cards.id = requested.value
     LEFT JOIN sets ON sets.id = cards.set_id
     ORDER BY label COLLATE NOCASE, targetId`,
  );
  const selectReleases = database.prepare(
    `SELECT requested.value AS targetId,
            COALESCE(sets.name, 'Unavailable release') AS label,
            CASE WHEN sets.id IS NULL THEN NULL ELSE upper(sets.code) END AS detail
     FROM json_each(?) AS requested
     LEFT JOIN sets ON sets.id = requested.value
     ORDER BY label COLLATE NOCASE, targetId`,
  );

  return (printingIds: readonly string[], rootSetIds: readonly string[]): SpoilerRevealSummaries =>
    SpoilerRevealSummariesSchema.parse({
      printings: z
        .array(CatalogRevealSummaryRowSchema)
        .parse(selectPrintings.all(JSON.stringify(printingIds)))
        .map((row) => toRevealSummary(row, "printing")),
      releases: z
        .array(CatalogRevealSummaryRowSchema)
        .parse(selectReleases.all(JSON.stringify(rootSetIds)))
        .map((row) => toRevealSummary(row, "release")),
    });
}

const CatalogCardSummaryRowSchema = CatalogCardSummarySchema.omit({
  gridImage: true,
  image: true,
}).extend({
  hasGridImage: z.union([z.literal(0), z.literal(1)]),
  hasImage: z.union([z.literal(0), z.literal(1)]),
  releasedOn: z.iso.date().nullable(),
});
type CatalogCardSummaryRow = z.infer<typeof CatalogCardSummaryRowSchema>;

const CatalogTotalRowSchema = z.object({ total: z.number().int().nonnegative() });
const CatalogUpcomingPrintingRowCommonSchema = z.object({
  id: catalogPrintingIdSchema,
  nextReleaseOn: z.iso.date(),
  releaseCode: z.string().min(1),
  releaseName: z.string().min(1),
  releasedOn: z.iso.date(),
  rootSetId: catalogPrintingIdSchema,
});
const CatalogUpcomingPrintingRowSchema = z.discriminatedUnion("isVisible", [
  CatalogUpcomingPrintingRowCommonSchema.extend({
    collectorNumber: z.string(),
    hasGridImage: z.union([z.literal(0), z.literal(1)]),
    hasImage: z.union([z.literal(0), z.literal(1)]),
    isVisible: z.literal(1),
    name: z.string(),
    rarity: z.string(),
    setCode: z.string(),
    setName: z.string(),
    typeLine: z.string(),
  }),
  CatalogUpcomingPrintingRowCommonSchema.extend({
    collectorNumber: z.null(),
    hasGridImage: z.literal(0),
    hasImage: z.literal(0),
    isVisible: z.literal(0),
    name: z.null(),
    rarity: z.null(),
    setCode: z.null(),
    setName: z.null(),
    typeLine: z.null(),
  }),
]);
type CatalogUpcomingPrintingRow = z.infer<typeof CatalogUpcomingPrintingRowSchema>;
const CatalogRevealSummaryRowSchema = z.object({
  detail: z.string().min(1).nullable(),
  label: z.string().min(1),
  rootSetId: catalogPrintingIdSchema.nullish(),
  targetId: catalogPrintingIdSchema,
});
type CatalogRevealSummaryRow = z.infer<typeof CatalogRevealSummaryRowSchema>;

function toRevealSummary(
  row: CatalogRevealSummaryRow,
  scope: "printing" | "release",
): SpoilerRevealSummary {
  const summary: SpoilerRevealSummary = { label: row.label, scope, targetId: row.targetId };
  if (row.detail) summary.detail = row.detail;
  if (scope === "printing" && row.rootSetId) summary.rootSetId = row.rootSetId;
  return summary;
}

function toCatalogCardSummary(row: CatalogCardSummaryRow): CatalogCardSummary {
  const { hasGridImage, hasImage, releasedOn: _, ...card } = row;

  return {
    ...card,
    gridImage: hasGridImage
      ? CatalogImageDescriptorSchema.parse({
          faceIndex: 0,
          printingId: row.id,
          size: "grid",
        })
      : null,
    image: hasImage
      ? CatalogImageDescriptorSchema.parse({
          faceIndex: 0,
          printingId: row.id,
          size: "thumb",
        })
      : null,
  };
}

function toCatalogUpcomingPrinting(row: CatalogUpcomingPrintingRow): CatalogUpcomingPrinting {
  const release = toCatalogReleaseSummary({
    code: row.releaseCode,
    name: row.releaseName,
    nextReleaseOn: row.nextReleaseOn,
    rootSetId: row.rootSetId,
  });

  if (row.isVisible === 0) {
    return CatalogUpcomingPrintingSchema.parse({
      printingId: row.id,
      release,
      releasedOn: row.releasedOn,
      status: "protected",
    });
  }

  return CatalogUpcomingPrintingSchema.parse({
    card: toCatalogCardSummary(CatalogCardSummaryRowSchema.parse(row)),
    release,
    releasedOn: row.releasedOn,
    status: "visible",
  });
}

export function validateCatalogListRequest(
  value: CatalogListRequest | JSONType | undefined,
): CatalogListRequest {
  if (value === undefined) {
    return {};
  }

  return CatalogListRequestSchema.parse(value);
}

export function validateCatalogUpcomingPrintingRequest(
  value: CatalogUpcomingPrintingRequest | JSONType | undefined,
): CatalogUpcomingPrintingRequest {
  return CatalogUpcomingPrintingRequestSchema.parse(value ?? {});
}

function toFtsQuery(query: string) {
  return (query.match(/[\p{L}\p{N}]+/gu) ?? []).map((term) => `"${term}"*`).join(" AND ");
}
