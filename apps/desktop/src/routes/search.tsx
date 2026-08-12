import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { PageFrame } from "../components/page";
import {
  SearchForm,
  SearchToggle,
  SearchUniverseFilter,
  SearchViewToggle,
} from "../features/search/search-controls";
import { SearchResults } from "../features/search/search-results";
import { type CatalogSearchState, validateCatalogSearch } from "../features/search/search-state";
import { useCatalogSearch } from "../features/search/use-catalog-search";

export const Route = createFileRoute("/search")({
  component: SearchPage,
  validateSearch: validateCatalogSearch,
});

function SearchPage() {
  const searchState = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeQuery = searchState.query ?? "";
  const includeArtSeries = searchState.artSeries !== false;
  const includeDigital = searchState.digital !== false;
  const gridView = searchState.grid === true;
  const uniqueCards = searchState.uniqueCards === true;
  const { cards, error, hasMore, loading, loadMore, total } = useCatalogSearch(
    activeQuery,
    uniqueCards,
    includeArtSeries,
    includeDigital,
    searchState.universe,
  );
  const updateSearch = useCallback(
    (update: CatalogSearchState) => {
      void navigate({
        replace: true,
        search: (current) => ({ ...current, ...update }),
      });
    },
    [navigate],
  );
  const search = useCallback(
    (query: string) => updateSearch({ query: query || undefined }),
    [updateSearch],
  );

  return (
    <PageFrame>
      <section {...stylex.props(styles.catalog)} aria-label="Card index">
        <SearchForm activeQuery={activeQuery} onSearch={search} />

        <div {...stylex.props(styles.indexMeta)}>
          <div {...stylex.props(styles.indexActions)}>
            <SearchToggle
              checked={uniqueCards}
              label="One print per card"
              onChange={(checked) => updateSearch({ uniqueCards: checked || undefined })}
            />
            <SearchToggle
              checked={includeArtSeries}
              label="Art series"
              onChange={(checked) => updateSearch({ artSeries: checked ? undefined : false })}
            />
            <SearchToggle
              checked={includeDigital}
              label="Digital cards"
              onChange={(checked) => updateSearch({ digital: checked ? undefined : false })}
            />
            <SearchUniverseFilter
              value={searchState.universe}
              onChange={(universe) => updateSearch({ universe })}
            />
            <SearchViewToggle
              grid={gridView}
              onChange={(grid) => updateSearch({ grid: grid || undefined })}
            />
            <span {...stylex.props(styles.count)} aria-live="polite">
              {loading && cards.length === 0
                ? activeQuery
                  ? "Searching…"
                  : "Reading index…"
                : `${(total ?? cards.length).toLocaleString()}${total === null && hasMore ? "+" : ""} ${activeQuery ? "matches" : uniqueCards ? (total === 1 ? "card" : "cards") : total === 1 ? "printing" : "printings"}`}
            </span>
          </div>
        </div>

        <SearchResults
          cards={cards}
          error={error}
          grid={gridView}
          hasMore={hasMore}
          loading={loading}
          total={total}
          onLoadMore={loadMore}
        />
      </section>
    </PageFrame>
  );
}

const styles = stylex.create({
  catalog: {
    borderTop: "1px solid #55584f",
  },
  indexMeta: {
    minHeight: "66px",
    paddingBlock: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "24px",
    borderBottom: "1px solid #34362f",
  },
  indexActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: {
      default: "24px",
      "@media (max-width: 820px)": "12px",
    },
  },
  count: {
    color: "#8f9287",
    fontSize: "8px",
    letterSpacing: "0.11em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
});
