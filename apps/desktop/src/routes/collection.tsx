import { Either, Schema } from "effect";
import { FinishSchema, finishLabels, finishes } from "@mooligan/domain/catalog";
import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
  cardConditionLabels,
  cardConditions,
  cardLanguageLabels,
  cardLanguages,
} from "@mooligan/domain/collection";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { BrowseViewToggle, browseStyles } from "../components/browse-layout";
import { PageFrame } from "../components/page-frame";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { createCollectionOrigin } from "../features/collection/collection-origin";
import { CollectionResults } from "../features/collection/collection-results";
import {
  type CollectionSearchState,
  validateCollectionSearch,
} from "../features/collection/collection-state";
import { useCollection } from "../features/collection/use-collection";
import { useViewPreference } from "../features/preferences/use-view-preference";
import { SearchForm } from "../features/search/search-controls";
import { colors } from "../styles/tokens.stylex.js";

export const Route = createFileRoute("/collection")({
  component: CollectionPage,
  validateSearch: validateCollectionSearch,
});

function CollectionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const collection = useCollection(search);
  const { setView, view } = useViewPreference("mooligan.collection.view");
  const activeFilters = Boolean(
    search.query || search.set || search.finish || search.language || search.condition,
  );
  const emptyCollection =
    !collection.loading && collection.total.holdings === 0 && collection.protectedCopies === 0;
  const filteredEmpty =
    !collection.loading &&
    activeFilters &&
    collection.filtered.holdings === 0 &&
    collection.holdings.every((holding) => holding.status !== "protected");

  const update = useCallback(
    (update: CollectionSearchState) => {
      void navigate({ replace: true, search: (current) => ({ ...current, ...update }) });
    },
    [navigate],
  );

  const clearFilters = useCallback(() => {
    void navigate({ replace: true, search: {} });
  }, [navigate]);

  const searchCollection = useCallback(
    (query: string) => update({ query: query || undefined }),
    [update],
  );

  return (
    <PageFrame>
      <section {...stylex.props(browseStyles.page)} aria-labelledby="collection-heading">
        <header {...stylex.props(browseStyles.header)}>
          <div>
            <h1 {...stylex.props(browseStyles.title)} id="collection-heading">
              Collection
            </h1>
            <p {...stylex.props(browseStyles.description)}>
              The paper cards you own, down to the printing.
            </p>
          </div>
          <Link {...stylex.props(styles.addLink)} search={{}} to="/search">
            <span aria-hidden="true">+</span> Add cards
          </Link>
        </header>
        <dl {...stylex.props(styles.totals)} aria-live="polite">
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.statLabel)}>Copies</dt>
            <dd {...stylex.props(styles.statValue)}>{collection.total.copies.toLocaleString()}</dd>
          </div>
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.statLabel)}>Unique cards</dt>
            <dd {...stylex.props(styles.statValue)}>{collection.total.cards.toLocaleString()}</dd>
          </div>
          <div {...stylex.props(styles.stat)}>
            <dt {...stylex.props(styles.statLabel)}>Holdings</dt>
            <dd {...stylex.props(styles.statValue)}>
              {collection.total.holdings.toLocaleString()}
            </dd>
          </div>
          {collection.protectedCopies ? (
            <div {...stylex.props(styles.stat)}>
              <dt {...stylex.props(styles.statLabel)}>Protected copies</dt>
              <dd {...stylex.props(styles.statValue)}>
                {collection.protectedCopies.toLocaleString()}
              </dd>
            </div>
          ) : null}
        </dl>
        <div>
          <SearchForm
            activeQuery={search.query ?? ""}
            ariaLabel="Search your Collection"
            autoFocus={false}
            id="collection-search"
            placeholder="Search cards in your collection"
            onSearch={searchCollection}
          />

          <div {...stylex.props(styles.controls)}>
            <Filter
              label="Set"
              options={[
                { label: "All sets", value: null },
                ...collection.sets.map(({ code, name }) => ({
                  label: `${name} · ${code.toUpperCase()}`,
                  value: code,
                })),
              ]}
              value={search.set ?? ""}
              onChange={(set) => update({ set: set || undefined })}
            />
            <Filter
              label="Finish"
              options={[
                { label: "All finishes", value: null },
                ...finishes.map((value) => ({ label: finishLabels[value], value })),
              ]}
              value={search.finish ?? ""}
              onChange={(finish) => {
                const parsed = Schema.decodeUnknownEither(FinishSchema)(finish);
                update({ finish: Either.isRight(parsed) ? parsed.right : undefined });
              }}
            />
            <Filter
              label="Language"
              options={[
                { label: "All languages", value: null },
                ...cardLanguages.map((value) => ({ label: cardLanguageLabels[value], value })),
              ]}
              value={search.language ?? ""}
              onChange={(language) => {
                const parsed = Schema.decodeUnknownEither(CardLanguageSchema)(language);
                update({ language: Either.isRight(parsed) ? parsed.right : undefined });
              }}
            />
            <Filter
              label="Condition"
              options={[
                { label: "All conditions", value: null },
                ...cardConditions.map((value) => ({ label: cardConditionLabels[value], value })),
              ]}
              value={search.condition ?? ""}
              onChange={(condition) => {
                const parsed = Schema.decodeUnknownEither(CardConditionSchema)(condition);
                update({ condition: Either.isRight(parsed) ? parsed.right : undefined });
              }}
            />
            <Filter
              label="Sort"
              options={[
                { label: "Name", value: "name" },
                { label: "Set", value: "set" },
                { label: "Quantity", value: "quantity" },
              ]}
              value={search.sort ?? "name"}
              onChange={(sort) => {
                const parsed = Schema.decodeUnknownEither(CollectionSortSchema)(sort);
                update({
                  sort:
                    Either.isRight(parsed) && parsed.right !== "name" ? parsed.right : undefined,
                });
              }}
            />
            {activeFilters ? (
              <Button size="sm" type="button" variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <div {...stylex.props(browseStyles.resultsBar)}>
            <p {...stylex.props(browseStyles.count)} aria-live="polite">
              {activeFilters
                ? `${collection.filtered.holdings.toLocaleString()} matching holdings · ${collection.filtered.copies.toLocaleString()} copies`
                : `${collection.total.holdings.toLocaleString()} ${collection.total.holdings === 1 ? "holding" : "holdings"}`}
            </p>
            <BrowseViewToggle
              label="Collection view"
              grid={view === "grid"}
              onChange={(grid) => setView(grid ? "grid" : "list")}
            />
          </div>

          {collection.error ? (
            <Message mark="!" title="Collection unavailable" copy={collection.error}>
              <Button size="sm" onClick={() => void collection.retry()}>
                Retry
              </Button>
            </Message>
          ) : emptyCollection ? (
            <Message
              mark="+"
              title="Make room for your first card"
              copy="Find a card in the catalog, choose a printing, and add the copies you own."
            >
              <Link {...stylex.props(browseStyles.link)} search={{}} to="/search">
                Find cards to add
              </Link>
            </Message>
          ) : filteredEmpty ? (
            <Message
              mark="0"
              title="No matching holdings"
              copy="No cards match these filters. Try another search or clear the filters."
            >
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear search and filters
              </Button>
            </Message>
          ) : collection.loading && collection.holdings.length === 0 ? (
            <Message
              mark="…"
              title="Reading your collection"
              copy="Loading the cards saved in this workspace."
            />
          ) : (
            <>
              <CollectionResults
                grid={view === "grid"}
                holdings={collection.holdings}
                origin={createCollectionOrigin(search)}
              />
              {collection.hasMore ? (
                <Button
                  disabled={collection.loading}
                  variant="secondary"
                  onClick={() => collection.loadMore()}
                >
                  {collection.loading ? "Reading…" : "Show 100 more holdings"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </section>
    </PageFrame>
  );
}

function Filter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: null | string }[];
  value: string;
}) {
  return (
    <div {...stylex.props(styles.filter)}>
      <span {...stylex.props(styles.controlLabel)}>{label}</span>
      <Select<string>
        items={options}
        value={value || null}
        onValueChange={(nextValue) => onChange(nextValue ?? "")}
      >
        <SelectTrigger aria-label={label} style={browseStyles.select}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value ?? "all"} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Message({
  children,
  copy,
  mark,
  title,
}: {
  children?: React.ReactNode;
  copy: string;
  mark: string;
  title: string;
}) {
  return (
    <div {...stylex.props(styles.message)}>
      <span {...stylex.props(styles.messageMark)} aria-hidden="true">
        {mark}
      </span>
      <div>
        <strong {...stylex.props(styles.messageTitle)}>{title}</strong>
        <p {...stylex.props(styles.messageCopy)}>{copy}</p>
        {children ? <div {...stylex.props(styles.messageActions)}>{children}</div> : null}
      </div>
    </div>
  );
}

const styles = stylex.create({
  addLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "8px",
    backgroundColor: colors.accent,
    color: "#052e16",
    fontSize: "13px",
    fontWeight: 500,
    textDecoration: "none",
    ":hover": { backgroundColor: "#30d77d" },
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "4px" },
  },
  totals: { display: "flex", flexWrap: "wrap", gap: "12px 28px", margin: 0 },
  stat: { display: "flex", flexDirection: "column-reverse", gap: "4px" },
  statLabel: { fontSize: "12px", color: "#989b92" },
  statValue: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 400,
    letterSpacing: "-.025em",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  },
  controls: {
    display: "flex",
    alignItems: "end",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
  },
  filter: { minWidth: 0, maxWidth: "100%", display: "grid", gap: "4px" },
  controlLabel: { color: "#989b92", fontSize: "12px", paddingLeft: "2px" },
  message: {
    minHeight: "300px",
    padding: "54px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    gap: "24px",
    backgroundColor: "#131413",
    borderRadius: "12px",
  },
  messageMark: {
    width: "48px",
    height: "64px",
    display: "grid",
    placeItems: "center",
    borderRadius: "6px",
    color: colors.accent,
    backgroundColor: "#213326",
    fontSize: "24px",
    boxShadow: "7px 5px 0 #1b231d",
  },
  messageTitle: { color: "#f4f1e8", fontSize: "22px", fontWeight: 400 },
  messageCopy: {
    maxWidth: "400px",
    margin: "12px auto 0",
    color: "#989b92",
    fontSize: "14px",
    lineHeight: 1.65,
  },
  messageActions: { marginTop: "22px" },
});
