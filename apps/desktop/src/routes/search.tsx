import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { PageFrame } from "../components/page-frame";
import {
  SearchForm,
  SearchModeTabs,
  SearchToggle,
  SearchUniverseFilter,
  SearchViewToggle,
} from "../features/search/search-controls";
import { SearchResults, UpcomingSearchResults } from "../features/search/search-results";
import { createCatalogSearchOrigin } from "../features/search/catalog-search-origin";
import { type CatalogSearchState, validateCatalogSearch } from "../features/search/search-state";
import { useCatalogSearch } from "../features/search/use-catalog-search";
import { useCatalogUpcomingPrintings } from "../features/search/use-catalog-upcoming-printings";
import { useSearchViewPreference } from "../features/search/use-search-view-preference";

export const Route = createFileRoute("/search")({
  component: SearchPage,
  validateSearch: validateCatalogSearch,
});
function SearchPage() {
  const searchState = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const activeQuery = searchState.query ?? "";
  const mode = searchState.mode === "upcoming" ? "upcoming" : "cards";
  const includeAdCards = searchState.adCards === true;
  const includeArtSeries = searchState.artSeries === true;
  const includeDigital = searchState.digital === true;
  const includeTokens = searchState.tokens === true;
  const { setView, view } = useSearchViewPreference(searchState.grid === true);
  const gridView = view === "grid";
  const uniqueCards = searchState.uniqueCards === true;
  const catalog = useCatalogSearch(
    activeQuery,
    uniqueCards,
    includeAdCards,
    includeArtSeries,
    includeDigital,
    includeTokens,
    searchState.universe,
    mode === "cards",
  );
  const upcomingCards = useCatalogUpcomingPrintings(mode === "upcoming");
  const resultIdentity = JSON.stringify([
    activeQuery,
    uniqueCards,
    includeAdCards,
    includeArtSeries,
    includeDigital,
    includeTokens,
    searchState.universe,
    mode,
  ]);
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
      <section {...stylex.props(styles.catalog)} aria-label="Catalog search">
        <SearchModeTabs
          mode={mode}
          onChange={(nextMode) =>
            updateSearch({ mode: nextMode === "upcoming" ? "upcoming" : undefined })
          }
        />

        {mode === "cards" ? (
          <div aria-labelledby="card-index-tab" id="card-index-panel" role="tabpanel">
            <SearchForm activeQuery={activeQuery} onSearch={search} />

            <div {...stylex.props(styles.indexMeta)}>
              <div {...stylex.props(styles.indexActions)}>
                <SearchToggle
                  checked={uniqueCards}
                  label="One print per card"
                  onChange={(checked) => updateSearch({ uniqueCards: checked || undefined })}
                />
                <SearchToggle
                  checked={includeTokens}
                  label="Tokens"
                  onChange={(checked) => updateSearch({ tokens: checked || undefined })}
                />
                <SearchToggle
                  checked={includeArtSeries}
                  label="Art series"
                  onChange={(checked) => updateSearch({ artSeries: checked || undefined })}
                />
                <SearchToggle
                  checked={includeAdCards}
                  label="Ad cards"
                  onChange={(checked) => updateSearch({ adCards: checked || undefined })}
                />
                <SearchToggle
                  checked={includeDigital}
                  label="Digital cards"
                  onChange={(checked) => updateSearch({ digital: checked || undefined })}
                />
                <SearchUniverseFilter
                  value={searchState.universe}
                  onChange={(universe) => updateSearch({ universe })}
                />
                <SearchViewToggle
                  grid={gridView}
                  onChange={(grid) => {
                    setView(grid ? "grid" : "list");
                    updateSearch({ grid: grid || undefined });
                  }}
                />
                <span {...stylex.props(styles.count)} aria-live="polite">
                  {catalog.loading && catalog.cards.length === 0
                    ? activeQuery
                      ? "Searching…"
                      : "Reading index…"
                    : `${(catalog.total ?? catalog.cards.length).toLocaleString()}${catalog.total === null && catalog.hasMore ? "+" : ""} ${activeQuery ? "matches" : uniqueCards ? (catalog.total === 1 ? "card" : "cards") : catalog.total === 1 ? "printing" : "printings"}`}
                </span>
              </div>
            </div>

            <SearchResults
              key={`${resultIdentity}:${gridView}`}
              cards={catalog.cards}
              error={catalog.error}
              grid={gridView}
              hasMore={catalog.hasMore}
              imagesReady={catalog.imagesReady}
              loading={catalog.loading}
              origin={createCatalogSearchOrigin(searchState)}
              total={catalog.total}
              onLoadMore={catalog.loadMore}
            />
          </div>
        ) : (
          <div aria-labelledby="upcoming-card-tab" id="upcoming-card-panel" role="tabpanel">
            <header {...stylex.props(styles.upcomingHeader)}>
              <div {...stylex.props(styles.upcomingIntro)}>
                <p {...stylex.props(styles.upcomingKicker)}>Catalog / Future printings</p>
                <h1 {...stylex.props(styles.upcomingTitle)}>Upcoming cards.</h1>
                <p {...stylex.props(styles.upcomingCopy)}>
                  Every future printing is listed here. Protected entries hide the card until you
                  choose to reveal that printing.
                </p>
              </div>
              <div {...stylex.props(styles.upcomingMeta)}>
                <SearchViewToggle
                  grid={gridView}
                  onChange={(grid) => {
                    setView(grid ? "grid" : "list");
                    updateSearch({ grid: grid || undefined });
                  }}
                />
                <span {...stylex.props(styles.count)} aria-live="polite">
                  {upcomingCards.loading && upcomingCards.printings.length === 0
                    ? "Reading upcoming cards…"
                    : `${(upcomingCards.total ?? upcomingCards.printings.length).toLocaleString()} upcoming ${upcomingCards.total === 1 ? "printing" : "printings"}`}
                </span>
              </div>
            </header>

            <UpcomingSearchResults
              key={`${resultIdentity}:${gridView}`}
              error={upcomingCards.error}
              grid={gridView}
              hasMore={upcomingCards.hasMore}
              imagesReady={upcomingCards.imagesReady}
              loading={upcomingCards.loading}
              origin={createCatalogSearchOrigin(searchState)}
              printings={upcomingCards.printings}
              total={upcomingCards.total}
              onLoadMore={upcomingCards.loadMore}
            />
          </div>
        )}
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
  upcomingHeader: {
    minHeight: "178px",
    paddingBlock: "30px 24px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "28px",
    borderBottom: "1px solid #34362f",
  },
  upcomingIntro: {
    maxWidth: "620px",
  },
  upcomingKicker: {
    margin: "0 0 10px",
    color: "#9da091",
    fontSize: "8px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  upcomingTitle: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: {
      default: "40px",
      "@media (max-width: 820px)": "32px",
    },
    fontWeight: 400,
    letterSpacing: "-0.035em",
    lineHeight: 1,
  },
  upcomingCopy: {
    maxWidth: "540px",
    margin: "14px 0 0",
    color: "#a6a89d",
    fontSize: "11px",
    lineHeight: 1.6,
  },
  upcomingMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "22px",
  },
  count: {
    color: "#8f9287",
    fontSize: "8px",
    letterSpacing: "0.11em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
});
