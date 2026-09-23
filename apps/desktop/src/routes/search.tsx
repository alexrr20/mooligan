import { Tabs } from "@base-ui/react/tabs";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { BrowseViewToggle, browseStyles } from "../components/browse-layout";
import { PageFrame } from "../components/page-frame";
import {
  SearchForm,
  SearchModeTabs,
  SearchToggle,
  SearchUniverseFilter,
} from "../features/search/search-controls";
import { SearchResults, UpcomingSearchResults } from "../features/search/search-results";
import { type CatalogSearchState, validateCatalogSearch } from "../features/search/search-state";
import { useCatalogSearch } from "../features/search/use-catalog-search";
import { useCatalogUpcomingPrintings } from "../features/search/use-catalog-upcoming-printings";
import { useViewPreference } from "../features/preferences/use-view-preference";

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
  const { setView, view } = useViewPreference(
    "mooligan.search.view",
    searchState.grid === true ? "grid" : undefined,
  );
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
      <Tabs.Root
        {...stylex.props(browseStyles.page)}
        value={mode}
        onValueChange={(value) =>
          updateSearch({ mode: value === "upcoming" ? "upcoming" : undefined })
        }
      >
        <header {...stylex.props(browseStyles.header, styles.alignEnd)}>
          <SearchModeTabs />
        </header>
        <Tabs.Panel value="cards">
          <SearchForm activeQuery={activeQuery} onSearch={search} />

          <div {...stylex.props(styles.filters)}>
            <div {...stylex.props(styles.filterOptions)}>
              <SearchToggle
                checked={uniqueCards}
                label="One printing per card"
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
            </div>
          </div>
          <div {...stylex.props(browseStyles.resultsBar, styles.alignEnd)}>
            <BrowseViewToggle
              label="Card view"
              grid={gridView}
              onChange={(grid) => {
                setView(grid ? "grid" : "list");
                updateSearch({ grid: grid || undefined });
              }}
            />
          </div>

          <SearchResults
            key={`${resultIdentity}:${gridView}`}
            cards={catalog.cards}
            error={catalog.error}
            grid={gridView}
            hasMore={catalog.hasMore}
            imagesReady={catalog.imagesReady}
            loading={catalog.loading}
            origin={{ kind: "search", search: searchState }}
            queryError={catalog.queryError}
            total={catalog.total}
            onLoadMore={catalog.loadMore}
          />
        </Tabs.Panel>
        <Tabs.Panel value="upcoming">
          <p {...stylex.props(styles.upcomingCopy)}>
            Browse future printings. Protected previews stay concealed until you reveal them.
          </p>
          <div {...stylex.props(browseStyles.resultsBar)}>
            <span {...stylex.props(browseStyles.count)} aria-live="polite">
              {upcomingCards.loading && upcomingCards.printings.length === 0
                ? "Reading upcoming cards…"
                : `${(upcomingCards.total ?? upcomingCards.printings.length).toLocaleString()} upcoming ${upcomingCards.total === 1 ? "printing" : "printings"}`}
            </span>
            <BrowseViewToggle
              label="Card view"
              grid={gridView}
              onChange={(grid) => {
                setView(grid ? "grid" : "list");
                updateSearch({ grid: grid || undefined });
              }}
            />
          </div>

          <UpcomingSearchResults
            key={`${resultIdentity}:${gridView}`}
            error={upcomingCards.error}
            grid={gridView}
            hasMore={upcomingCards.hasMore}
            imagesReady={upcomingCards.imagesReady}
            loading={upcomingCards.loading}
            origin={{ kind: "search", search: searchState }}
            printings={upcomingCards.printings}
            total={upcomingCards.total}
            onLoadMore={upcomingCards.loadMore}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </PageFrame>
  );
}

const styles = stylex.create({
  alignEnd: { justifyContent: "flex-end" },
  filters: { marginTop: "8px" },
  filterOptions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" },
  upcomingCopy: { margin: 0, color: "#989b92", fontSize: "14px", lineHeight: 1.6 },
});
