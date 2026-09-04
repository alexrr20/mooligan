import { FinishSchema } from "@mooligan/domain/catalog";
import {
  CardConditionSchema,
  CardLanguageSchema,
  CollectionSortSchema,
  cardConditions,
  cardLanguages,
} from "@mooligan/domain/collection";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { PageFrame } from "../components/page-frame";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { createCollectionOrigin } from "../features/collection/collection-origin";
import { CollectionResults } from "../features/collection/collection-results";
import {
  type CollectionSearchState,
  validateCollectionSearch,
} from "../features/collection/collection-state";
import { useCollection } from "../features/collection/use-collection";
import { useCollectionViewPreference } from "../features/collection/use-collection-view-preference";
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
  const { setView, view } = useCollectionViewPreference();
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
      <section {...stylex.props(styles.page)} aria-labelledby="collection-heading">
        <header {...stylex.props(styles.header)}>
          <div>
            <p {...stylex.props(styles.kicker)}>Workspace / Paper cards</p>
            <h1 {...stylex.props(styles.title)} id="collection-heading">
              Collection.
            </h1>
          </div>
          <div {...stylex.props(styles.total)} aria-live="polite">
            <strong>{collection.total.copies.toLocaleString()}</strong>
            <span>
              copies across {collection.total.cards.toLocaleString()}{" "}
              {collection.total.cards === 1 ? "card" : "cards"}
            </span>
            {collection.protectedCopies ? (
              <span>plus {collection.protectedCopies.toLocaleString()} protected copies</span>
            ) : null}
          </div>
        </header>

        <SearchForm
          activeQuery={search.query ?? ""}
          ariaLabel="Search your Collection"
          autoFocus={false}
          id="collection-search"
          placeholder="SEARCH OWNED CARDS"
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
              { label: "Nonfoil", value: "nonfoil" },
              { label: "Foil", value: "foil" },
              { label: "Etched", value: "etched" },
              { label: "Glossy", value: "glossy" },
            ]}
            value={search.finish ?? ""}
            onChange={(finish) => {
              const parsed = FinishSchema.safeParse(finish);
              update({ finish: parsed.success ? parsed.data : undefined });
            }}
          />
          <Filter
            label="Language"
            options={[
              { label: "All languages", value: null },
              ...cardLanguages.map(({ label, value }) => ({ label, value })),
            ]}
            value={search.language ?? ""}
            onChange={(language) => {
              const parsed = CardLanguageSchema.safeParse(language);
              update({ language: parsed.success ? parsed.data : undefined });
            }}
          />
          <Filter
            label="Condition"
            options={[
              { label: "All conditions", value: null },
              ...cardConditions.map(({ label, value }) => ({ label, value })),
            ]}
            value={search.condition ?? ""}
            onChange={(condition) => {
              const parsed = CardConditionSchema.safeParse(condition);
              update({ condition: parsed.success ? parsed.data : undefined });
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
              const parsed = CollectionSortSchema.safeParse(sort);
              update({
                sort: parsed.success && parsed.data !== "name" ? parsed.data : undefined,
              });
            }}
          />
          <div {...stylex.props(styles.viewControl)}>
            <span {...stylex.props(styles.controlLabel)}>View</span>
            <ToggleGroup
              aria-label="Collection view"
              value={[view]}
              onValueChange={(nextViews) => {
                const nextView = nextViews[0];
                if (nextView) setView(nextView);
              }}
            >
              {(["list", "grid"] as const).map((option) => (
                <ToggleGroupItem key={option} type="button" value={option}>
                  {option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {activeFilters ? (
            <Button size="sm" type="button" variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>

        {activeFilters ? (
          <p {...stylex.props(styles.filteredCount)} aria-live="polite">
            {collection.filtered.holdings.toLocaleString()} matching Holdings ·{" "}
            {collection.filtered.copies.toLocaleString()} copies
          </p>
        ) : null}

        {collection.error ? (
          <Message mark="!" title="Collection unavailable" copy={collection.error}>
            <Button size="sm" onClick={() => void collection.retry()}>
              Retry
            </Button>
          </Message>
        ) : emptyCollection ? (
          <Message
            mark="+"
            title="Start with an exact printing"
            copy="Find a paper card, choose its physical properties, and save the first copies you own."
          >
            <Link {...stylex.props(styles.messageLink)} search={{}} to="/search">
              Find cards to add
            </Link>
          </Message>
        ) : filteredEmpty ? (
          <Message
            mark="0"
            title="No matching Holdings"
            copy="Your Collection has cards, but none match this search and filter combination."
          >
            <Button size="sm" variant="secondary" onClick={clearFilters}>
              Clear search and filters
            </Button>
          </Message>
        ) : collection.loading && collection.holdings.length === 0 ? (
          <Message
            mark="…"
            title="Reading your Collection"
            copy="Grouping copies into Holdings from this workspace."
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
                {collection.loading ? "Reading…" : "Load 100 more Holdings"}
              </Button>
            ) : null}
          </>
        )}
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
        <SelectTrigger aria-label={label}>
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
  page: {
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#55584f",
  },
  header: {
    minHeight: "210px",
    paddingBlock: "42px 30px",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "32px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
    "@media (max-width: 700px)": { alignItems: "flex-start", flexDirection: "column" },
  },
  kicker: {
    margin: "0 0 14px",
    color: colors.accent,
    fontSize: "8px",
    letterSpacing: ".14em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "clamp(52px, 8vw, 88px)",
    fontWeight: 400,
    letterSpacing: "-.06em",
    lineHeight: 0.86,
  },
  total: {
    minWidth: "190px",
    paddingBottom: "5px",
    display: "grid",
    gap: "4px",
    color: "#85887e",
    fontSize: "8px",
    textAlign: "right",
    textTransform: "uppercase",
    "@media (max-width: 700px)": { textAlign: "left" },
  },
  controls: {
    minHeight: "82px",
    paddingBlock: "13px",
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "13px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  filter: { minWidth: "120px", display: "grid", gap: "7px" },
  controlLabel: {
    color: "#85887e",
    fontSize: "7px",
    letterSpacing: ".12em",
    textTransform: "uppercase",
  },
  viewControl: { display: "grid", gap: "7px" },
  filteredCount: {
    margin: 0,
    paddingBlock: "12px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
    color: "#85887e",
    fontSize: "8px",
    textTransform: "uppercase",
  },
  message: {
    minHeight: "300px",
    paddingBlock: "64px",
    display: "grid",
    gridTemplateColumns: "62px minmax(0, 520px)",
    gap: "25px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  messageMark: {
    width: "48px",
    height: "66px",
    display: "grid",
    placeItems: "center",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#55584f",
    borderRadius: "3px",
    color: colors.accent,
    fontSize: "18px",
    boxShadow: "6px 6px 0 #242620",
  },
  messageTitle: { color: "#f4f1e8", fontSize: "26px", fontWeight: 400 },
  messageCopy: { margin: "12px 0 0", color: "#a6a89d", fontSize: "11px", lineHeight: 1.65 },
  messageActions: { marginTop: "20px" },
  messageLink: {
    minHeight: "36px",
    paddingInline: "13px",
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "3px",
    color: "#064e3b",
    backgroundColor: colors.accent,
    fontSize: "8px",
    textDecoration: "none",
    textTransform: "uppercase",
  },
});
