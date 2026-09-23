import type { CatalogDatabase as DatabaseSync } from "./database.ts";

import { ColorSchema } from "@mooligan/domain/catalog";
import {
  CatalogCardSummarySchema,
  CatalogListRequestSchema,
  CatalogUpcomingPrintingRequestSchema,
  type CatalogCardSummary,
  type CatalogListPage,
  type CatalogListRequest,
  type CatalogUpcomingPrinting,
  type CatalogUpcomingPrintingPage,
  type CatalogUpcomingPrintingRequest,
} from "@mooligan/domain/catalog-search";
import {
  type CatalogReleaseSummary,
  type SpoilerRevealSummary,
  type SpoilerRevealSummaries,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";
import { IsoDateSchema, type JsonValue } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";
import type { Mutable } from "effect/Types";

import { CatalogReleaseSummaryRowSchema, toCatalogReleaseSummary } from "@mooligan/catalog/release";
import {
  catalogVisibilityParameters,
  catalogVisibilitySql,
  catalogVisibilitySqlFor,
  effectiveReleaseDateSql,
} from "@mooligan/catalog/visibility";
import { compileScryfallQuery } from "@mooligan/catalog/scryfall-query";

const catalogPrintingIdSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));

export const CatalogColorPrintingIdsSchema = Schema.Array(catalogPrintingIdSchema).pipe(
  Schema.maxItems(100_000),
);

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
                     COALESCE(json_extract(cards.json, '$.digital'), 0) AS isDigital,
                     cards.set_code AS setCode,
                     cards.set_name AS setName,
                     cards.collector_number AS collectorNumber,
                     cards.type_line AS typeLine,
                     cards.rarity,
                     ${effectiveReleaseDateSql} AS releasedOn`;
const artSeriesFilter =
  "$includeArtSeries OR COALESCE(json_extract(cards.json, '$.layout'), '') <> 'art_series'";
const digitalFilter = "$includeDigital OR COALESCE(json_extract(cards.json, '$.digital'), 0) = 0";
const tokenCard =
  "COALESCE(json_extract(cards.json, '$.layout'), '') IN ('token', 'double_faced_token')";
const adCard = `COALESCE(json_extract(cards.json, '$.layout'), '') = 'token'
  AND cards.type_line = 'Card'
  AND substr(cards.name, -3) = ' Ad'`;
const tokenFilter = `$includeTokens OR NOT (${tokenCard}) OR (${adCard})`;
const adCardFilter = `$includeAdCards OR NOT (${adCard})`;
const universesBeyond = `EXISTS (
  SELECT 1
  FROM json_each(cards.json, '$.promo_types')
  WHERE value = 'universesbeyond'
)`;
const universeFilter = `$universe = '' OR (${universesBeyond}) = ($universe = 'beyond')`;
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
     LIMIT $limit OFFSET $offset`,
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
     LIMIT $limit OFFSET $offset`,
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
    request: CatalogListRequest = {},
    visibility: SpoilerVisibilitySnapshot,
  ): CatalogListPage => {
    const visibilityParameters = catalogVisibilityParameters(visibility);
    const limit =
      Number.isSafeInteger(request.limit) && request.limit! > 0
        ? Math.min(request.limit!, 250)
        : 100;
    const offset =
      Number.isSafeInteger(request.offset) && request.offset! >= 0 ? request.offset! : 0;
    const query = request.query?.trim() ?? "";
    const compiledQuery = query ? compileScryfallQuery(query, visibility) : null;
    const includeAdCards = request.includeAdCards !== false;
    const includeArtSeries = request.includeArtSeries !== false;
    const includeDigital = request.includeDigital !== false;
    const includeTokens = request.includeTokens !== false;
    const uniqueCards = request.uniqueCards === true;
    const universe = request.universe ?? "";
    const filterParameters = {
      $includeArtSeries: Number(includeArtSeries),
      $includeDigital: Number(includeDigital),
      $includeTokens: Number(includeTokens),
      $includeAdCards: Number(includeAdCards),
      $universe: universe,
    };

    if (compiledQuery && !compiledQuery.success) {
      return { cards: [], hasMore: false, queryError: compiledQuery.error, total: 0 };
    }

    // Walk the existing result-order index so LIMIT can stop before reading every match.
    const statement = compiledQuery
      ? database.prepare(
          uniqueCards
            ? `SELECT ${cardColumns}
               FROM cards INDEXED BY cards_recent_order
               WHERE (${compiledQuery.sql})
                 AND (${cardFilter})
                 AND ${catalogVisibilitySql}
                 AND NOT EXISTS (
                   SELECT 1 FROM cards AS newer
                   WHERE newer.identity_id = cards.identity_id
                     AND (${compiledQuery.sql.replaceAll("cards.", "newer.")})
                     AND (${newerCardFilter})
                     AND ${catalogVisibilitySqlFor("newer")}
                     AND ${newerCardPrecedes}
                 )
               ORDER BY ${effectiveReleaseDateSql} DESC,
                        cards.name COLLATE NOCASE,
                        cards.set_code COLLATE NOCASE,
                        cards.collector_number COLLATE NOCASE,
                        cards.id
               LIMIT $limit OFFSET $offset`
            : `SELECT ${cardColumns}
               FROM cards INDEXED BY cards_recent_order
               WHERE (${compiledQuery.sql})
                 AND (${cardFilter})
                 AND ${catalogVisibilitySql}
               ORDER BY ${effectiveReleaseDateSql} DESC,
                        cards.name COLLATE NOCASE,
                        cards.set_code COLLATE NOCASE,
                        cards.collector_number COLLATE NOCASE,
                        cards.id
               LIMIT $limit OFFSET $offset`,
        )
      : uniqueCards
        ? browseUniqueCards
        : browse;
    const rows = decodeCatalogCardSummaryRows(
      statement.all({
        ...compiledQuery?.parameters,
        ...filterParameters,
        ...visibilityParameters,
        $limit: limit + 1,
        $offset: offset,
      }),
    );
    const hasMore = rows.length > limit;
    const cards = rows.slice(0, limit).map(toCatalogCardSummary);
    let total: number | null;
    if (compiledQuery || !includeAdCards || !includeDigital || !includeTokens || universe) {
      total = hasMore ? null : offset + cards.length;
    } else {
      const noReveals =
        visibility.revealedPrintingIds.length === 0 && visibility.revealedRootSetIds.length === 0;
      let row;
      if (uniqueCards) {
        if (includeArtSeries && visibility.policy === "show") row = fullUniqueCardTotal.get();
        else if (includeArtSeries && noReveals)
          row = protectedUniqueCardTotal.get(visibility.currentDate);
        else
          row = uniqueCardTotal.get({
            $includeArtSeries: Number(includeArtSeries),
            ...visibilityParameters,
          });
      } else if (!includeArtSeries) row = nonArtSeriesTotal.get(visibilityParameters);
      else if (visibility.policy === "show") row = fullCatalogTotal.get();
      else if (noReveals) row = protectedCatalogTotal.get(visibility.currentDate);
      else row = catalogTotal.get(visibilityParameters);
      total = decodeCatalogTotalRow(row).total;
    }

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
    return decodeCatalogReleaseSummaryRows(selectUpcoming.all(visibility.currentDate)).map(
      toCatalogReleaseSummary,
    );
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
       WHERE ${effectiveReleaseDateSql} > $visibilityDate
     )
     SELECT id,
            CASE WHEN isVisible = 1 THEN name ELSE NULL END AS name,
            CASE WHEN isVisible = 1 THEN hasImage ELSE 0 END AS hasImage,
            CASE WHEN isVisible = 1 THEN hasGridImage ELSE 0 END AS hasGridImage,
            CASE WHEN isVisible = 1 THEN isDigital ELSE NULL END AS isDigital,
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
     LIMIT $limit OFFSET $offset`,
  );
  const countUpcoming = database.prepare(
    `SELECT COUNT(*) AS total
     FROM cards
     WHERE ${effectiveReleaseDateSql} > ?`,
  );

  return (
    request: CatalogUpcomingPrintingRequest = {},
    visibility: SpoilerVisibilitySnapshot,
  ): CatalogUpcomingPrintingPage => {
    const limit = request.limit ?? 100;
    const offset = request.offset ?? 0;
    const rows = decodeCatalogUpcomingPrintingRows(
      selectUpcoming.all({
        ...catalogVisibilityParameters(visibility),
        $limit: limit + 1,
        $offset: offset,
      }),
    );
    const total = decodeCatalogTotalRow(countUpcoming.get(visibility.currentDate)).total;

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
       WHERE sets.id = $targetId
       UNION ALL
       SELECT cards.root_set_id AS rootSetId, 1 AS priority
       FROM cards
       WHERE cards.id = $targetId
     )
     ORDER BY priority
     LIMIT 1`,
  );

  return (targetId: string): string | null => {
    const row = decodeCatalogRootSetRow(selectRoot.get({ $targetId: targetId }));
    return Option.isSome(row) ? row.value.rootSetId : null;
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

  return (
    printingIds: readonly string[],
    rootSetIds: readonly string[],
  ): SpoilerRevealSummaries => ({
    printings: decodeCatalogRevealSummaryRows(selectPrintings.all(JSON.stringify(printingIds))).map(
      (row) => toRevealSummary(row, "printing"),
    ),
    releases: decodeCatalogRevealSummaryRows(selectReleases.all(JSON.stringify(rootSetIds))).map(
      (row) => toRevealSummary(row, "release"),
    ),
  });
}

const sqliteFlagSchema = Schema.Literal(0, 1);
const CatalogCardSummaryRowSchema = Schema.Struct({
  ...CatalogCardSummarySchema.omit("gridImage", "image").fields,
  hasGridImage: sqliteFlagSchema,
  hasImage: sqliteFlagSchema,
  isDigital: sqliteFlagSchema,
  releasedOn: Schema.NullOr(IsoDateSchema),
});
type CatalogCardSummaryRow = typeof CatalogCardSummaryRowSchema.Type;
const decodeCatalogCardSummaryRows = Schema.decodeUnknownSync(
  Schema.Array(CatalogCardSummaryRowSchema),
);

const decodeCatalogTotalRow = Schema.decodeUnknownSync(
  Schema.Struct({ total: Schema.NonNegativeInt }),
);
const decodeCatalogReleaseSummaryRows = Schema.decodeUnknownSync(
  Schema.Array(CatalogReleaseSummaryRowSchema),
);
const decodeCatalogRootSetRow = Schema.decodeUnknownOption(
  Schema.Struct({ rootSetId: catalogPrintingIdSchema }),
);
const catalogUpcomingPrintingRowCommonFields = {
  id: catalogPrintingIdSchema,
  nextReleaseOn: IsoDateSchema,
  releaseCode: Schema.NonEmptyString,
  releaseName: Schema.NonEmptyString,
  releasedOn: IsoDateSchema,
  rootSetId: catalogPrintingIdSchema,
};
const CatalogUpcomingPrintingRowSchema = Schema.Union(
  Schema.Struct({
    ...catalogUpcomingPrintingRowCommonFields,
    collectorNumber: Schema.String,
    hasGridImage: sqliteFlagSchema,
    hasImage: sqliteFlagSchema,
    isDigital: sqliteFlagSchema,
    isVisible: Schema.Literal(1),
    name: Schema.String,
    rarity: Schema.String,
    setCode: Schema.String,
    setName: Schema.String,
    typeLine: Schema.String,
  }),
  Schema.Struct({
    ...catalogUpcomingPrintingRowCommonFields,
    collectorNumber: Schema.Null,
    hasGridImage: Schema.Literal(0),
    hasImage: Schema.Literal(0),
    isDigital: Schema.Null,
    isVisible: Schema.Literal(0),
    name: Schema.Null,
    rarity: Schema.Null,
    setCode: Schema.Null,
    setName: Schema.Null,
    typeLine: Schema.Null,
  }),
);
type CatalogUpcomingPrintingRow = typeof CatalogUpcomingPrintingRowSchema.Type;
const decodeCatalogUpcomingPrintingRows = Schema.decodeUnknownSync(
  Schema.Array(CatalogUpcomingPrintingRowSchema),
);
const CatalogRevealSummaryRowSchema = Schema.Struct({
  detail: Schema.NullOr(Schema.NonEmptyString),
  label: Schema.NonEmptyString,
  rootSetId: Schema.optional(Schema.NullOr(catalogPrintingIdSchema)),
  targetId: catalogPrintingIdSchema,
});
type CatalogRevealSummaryRow = typeof CatalogRevealSummaryRowSchema.Type;
const decodeCatalogRevealSummaryRows = Schema.decodeUnknownSync(
  Schema.Array(CatalogRevealSummaryRowSchema),
);
const decodeCatalogListRequest = Schema.decodeUnknownSync(CatalogListRequestSchema);
const decodeCatalogUpcomingPrintingRequest = Schema.decodeUnknownSync(
  CatalogUpcomingPrintingRequestSchema,
);
const decodeCatalogColorRows = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ colors: Schema.NullOr(Schema.String) })),
);
const decodeColorIdentity = Schema.decodeUnknownSync(Schema.parseJson(Schema.Array(ColorSchema)));

function toRevealSummary(
  row: CatalogRevealSummaryRow,
  scope: "printing" | "release",
): SpoilerRevealSummary {
  const summary: Mutable<SpoilerRevealSummary> = {
    label: row.label,
    scope,
    targetId: row.targetId,
  };
  if (row.detail) summary.detail = row.detail;
  if (scope === "printing" && row.rootSetId) summary.rootSetId = row.rootSetId;
  return summary;
}

function toCatalogCardSummary(row: CatalogCardSummaryRow): CatalogCardSummary {
  return {
    collectorNumber: row.collectorNumber,
    id: row.id,
    isDigital: row.isDigital === 1,
    name: row.name,
    rarity: row.rarity,
    setCode: row.setCode,
    setName: row.setName,
    typeLine: row.typeLine,
    gridImage: row.hasGridImage
      ? {
          faceIndex: 0,
          printingId: row.id,
          size: "grid",
        }
      : null,
    image: row.hasImage
      ? {
          faceIndex: 0,
          printingId: row.id,
          size: "thumb",
        }
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
    return {
      printingId: row.id,
      release,
      releasedOn: row.releasedOn,
      status: "protected",
    };
  }

  return {
    card: toCatalogCardSummary(row),
    release,
    releasedOn: row.releasedOn,
    status: "visible",
  };
}

export function validateCatalogListRequest(
  value: CatalogListRequest | JsonValue | undefined,
): CatalogListRequest {
  if (value === undefined) {
    return {};
  }

  return decodeCatalogListRequest(value);
}

export function validateCatalogUpcomingPrintingRequest(
  value: CatalogUpcomingPrintingRequest | JsonValue | undefined,
): CatalogUpcomingPrintingRequest {
  return decodeCatalogUpcomingPrintingRequest(value ?? {});
}

export function createCatalogColorsQuery(database: DatabaseSync) {
  const select = database.prepare(
    `SELECT CASE WHEN cards.id IS NOT NULL AND ${catalogVisibilitySql}
                 THEN COALESCE(json_extract(cards.json, '$.color_identity'), '[]')
                 ELSE NULL END AS colors
     FROM json_each($printingIds) AS requested
     LEFT JOIN cards ON cards.id = requested.value`,
  );
  return (printingIds: readonly string[], visibility: SpoilerVisibilitySnapshot) => {
    const rows = decodeCatalogColorRows(
      select.all({
        ...catalogVisibilityParameters(visibility),
        $printingIds: JSON.stringify(printingIds),
      }),
    );
    if (!rows.length || rows.some(({ colors }) => colors === null)) return null;
    return [...new Set(rows.flatMap(({ colors }) => decodeColorIdentity(colors!)))];
  };
}
