import type { CatalogReleaseSummary } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useId } from "react";

import { browseStyles } from "../../components/browse-layout";
import { Button } from "../../components/ui/button";
import { colors } from "../../styles/tokens.stylex.js";
import { CatalogSetSymbol } from "../catalog/catalog-set-symbol";
import {
  formatSpoilerReleaseDate,
  getReleaseProtectionControl,
  releaseActionAccessibleName,
} from "./spoiler-ui-state";
import { useSpoilers } from "./use-spoilers";
import { useUpcomingReleases } from "./use-upcoming-releases";

export function UpcomingReleases() {
  const upcoming = useUpcomingReleases();
  const spoilers = useSpoilers();
  const months = new Map<string, CatalogReleaseSummary[]>();
  for (const release of upcoming.releases) {
    const month = release.nextReleaseOn.slice(0, 7);
    const releases = months.get(month) ?? [];
    releases.push(release);
    months.set(month, releases);
  }

  return (
    <section {...stylex.props(browseStyles.page)} aria-labelledby="upcoming-releases-heading">
      <header {...stylex.props(browseStyles.header)}>
        <div>
          <h1 {...stylex.props(browseStyles.title)} id="upcoming-releases-heading">
            Sets
          </h1>
          <p {...stylex.props(browseStyles.description)}>
            Upcoming releases from your local catalog.
          </p>
        </div>
        <Link {...stylex.props(browseStyles.link)} to="/search" search={{ mode: "upcoming" }}>
          Browse upcoming cards <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <aside {...stylex.props(styles.notice)} aria-label="Spoiler protection">
        <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true">
          <path
            d="M10 2 3 5v5c0 5 7 9 7 9s7-4 7-9V5l-7-3Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="m7 10 2 2 4-4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p {...stylex.props(styles.noticeCopy)}>
          {spoilers.state.policy === "show"
            ? "All previews are visible. You can turn spoiler protection on in Settings."
            : "Previews stay hidden until release day. Reveal a release family whenever you're ready."}
        </p>
        <Link {...stylex.props(browseStyles.link)} to="/settings">
          Spoiler settings
        </Link>
      </aside>

      {upcoming.error ? (
        <ReleaseMessage mark="!" title="Upcoming releases unavailable">
          {upcoming.error}
        </ReleaseMessage>
      ) : upcoming.loading ? (
        <div {...stylex.props(styles.loading)} aria-label="Reading upcoming releases" role="status">
          <span {...stylex.props(styles.loadingSymbol)} aria-hidden="true" />
          <span {...stylex.props(styles.loadingCopy)}>Reading local release calendar…</span>
        </div>
      ) : upcoming.releases.length === 0 ? (
        <ReleaseMessage mark="0" title="No upcoming releases">
          The installed catalog has no future release families.
        </ReleaseMessage>
      ) : (
        <div {...stylex.props(styles.calendar)}>
          {[...months]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, releases]) => (
              <section
                key={month}
                {...stylex.props(styles.month)}
                aria-labelledby={`release-month-${month}`}
              >
                <h2 {...stylex.props(styles.monthTitle)} id={`release-month-${month}`}>
                  <time dateTime={month}>
                    {new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(
                      new Date(`${month}-01T00:00:00Z`),
                    )}
                    <span {...stylex.props(styles.year)}>{month.slice(0, 4)}</span>
                  </time>
                  <span {...stylex.props(styles.monthCount)}>
                    {releases.length} {releases.length === 1 ? "release" : "releases"}
                  </span>
                </h2>
                <ul {...stylex.props(styles.list)}>
                  {releases.map((release) => (
                    <UpcomingRelease
                      key={release.rootSetId}
                      busy={spoilers.busy}
                      release={release}
                      state={spoilers.state}
                      onProtect={() => spoilers.protectRelease(release.rootSetId)}
                      onReveal={() => spoilers.revealRelease(release.rootSetId)}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      {spoilers.error ? (
        <p {...stylex.props(styles.error)} role="alert">
          The preview choice could not be saved. Try again.
        </p>
      ) : null}
    </section>
  );
}

function UpcomingRelease({
  busy,
  onProtect,
  onReveal,
  release,
  state,
}: {
  busy: boolean;
  onProtect: () => void;
  onReveal: () => void;
  release: CatalogReleaseSummary;
  state: SpoilerState;
}) {
  const descriptionId = useId();
  const control = getReleaseProtectionControl(state, release.rootSetId);

  return (
    <li {...stylex.props(styles.item)}>
      <time
        {...stylex.props(styles.date)}
        dateTime={release.nextReleaseOn}
        aria-label={formatSpoilerReleaseDate(release.nextReleaseOn)}
      >
        <span {...stylex.props(styles.day)}>{Number(release.nextReleaseOn.slice(8, 10))}</span>
        <span {...stylex.props(styles.weekday)}>
          {new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
            new Date(`${release.nextReleaseOn}T00:00:00Z`),
          )}
        </span>
      </time>
      <div {...stylex.props(styles.identity)}>
        <CatalogSetSymbol code={release.code} symbol={release.symbol} size="large" />
        <div {...stylex.props(styles.names)}>
          <h3 {...stylex.props(styles.name)}>{release.name}</h3>
          <div {...stylex.props(styles.releaseMeta)}>
            <span {...stylex.props(styles.code)}>{release.code}</span>
            <span>
              {control.action === "reveal" ? "Release family protected" : "Release family revealed"}
            </span>
          </div>
        </div>
      </div>

      <div {...stylex.props(styles.action)}>
        <Button
          aria-describedby={descriptionId}
          aria-label={releaseActionAccessibleName(control.label, release.name)}
          disabled={busy || control.disabled}
          size="sm"
          type="button"
          variant="secondary"
          style={styles.releaseButton}
          onClick={control.action === "reveal" ? onReveal : onProtect}
        >
          {control.label}
        </Button>
        <p {...stylex.props(styles.actionCopy)} id={descriptionId}>
          {control.description}
        </p>
      </div>
    </li>
  );
}

function ReleaseMessage({
  children,
  mark,
  title,
}: {
  children: string;
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
        <p {...stylex.props(styles.messageCopy)}>{children}</p>
      </div>
    </div>
  );
}

const styles = stylex.create({
  notice: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px 16px",
    padding: "18px 20px",
    borderRadius: "10px",
    backgroundColor: "#142018",
    color: "#84b593",
  },
  noticeCopy: { flex: "1 1 320px", margin: 0, color: "#b0bdaf", fontSize: "13px", lineHeight: 1.6 },
  calendar: { display: "grid", gap: "40px", marginTop: "10px" },
  month: {
    display: "grid",
    gridTemplateColumns: "150px minmax(0, 1fr)",
    gap: "28px",
    "@media (max-width: 900px)": { gridTemplateColumns: "minmax(0, 1fr)", gap: "16px" },
  },
  monthTitle: {
    margin: 0,
    paddingTop: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    fontSize: "20px",
    fontWeight: 400,
    lineHeight: 1.3,
    color: "#f4f1e8",
    "@media (max-width: 900px)": {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingTop: 0,
    },
  },
  year: {
    color: "#85887f",
    display: "block",
    fontSize: "14px",
    marginTop: "4px",
    "@media (max-width: 900px)": { display: "inline", marginLeft: "8px" },
  },
  monthCount: { color: "#85887f", fontSize: "12px" },
  list: { display: "grid", gap: "12px", margin: 0, padding: 0, listStyle: "none" },
  item: {
    padding: "24px",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) 210px",
    alignItems: "center",
    gap: "24px",
    borderRadius: "12px",
    backgroundColor: "#151615",
    "@media (max-width: 1100px)": { gridTemplateColumns: "44px minmax(0, 1fr)" },
    "@media (max-width: 620px)": { padding: "18px", gap: "18px" },
  },
  date: { display: "grid", gap: "4px", textAlign: "center" },
  day: {
    color: "#f4f1e8",
    fontSize: "28px",
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-.025em",
  },
  weekday: { color: "#85887f", fontSize: "12px" },
  identity: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "20px",
    "@media (max-width: 620px)": { flexDirection: "column", alignItems: "start", gap: "12px" },
  },
  names: { minWidth: 0, display: "grid", gap: "10px" },
  name: {
    margin: 0,
    overflowWrap: "anywhere",
    color: "#f4f1e8",
    fontSize: "20px",
    fontWeight: 400,
    letterSpacing: "-.015em",
    lineHeight: 1.3,
  },
  releaseMeta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px 12px",
    color: "#85887f",
    fontSize: "12px",
  },
  code: { color: "#b5b8ae", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".06em" },
  action: {
    display: "grid",
    justifyItems: "start",
    gap: "10px",
    "@media (max-width: 1100px)": { gridColumn: "2", paddingLeft: "88px" },
    "@media (max-width: 620px)": { paddingLeft: 0 },
  },
  releaseButton: { height: "34px", paddingInline: "12px", borderWidth: 0, fontSize: "12px" },
  actionCopy: { maxWidth: "300px", margin: 0, color: "#989b92", fontSize: "12px", lineHeight: 1.5 },
  loading: {
    minHeight: "180px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "18px",
  },
  loadingSymbol: { width: "38px", height: "38px", borderRadius: "50%", backgroundColor: "#20231f" },
  loadingCopy: { color: "#989b92", fontSize: "13px" },
  message: {
    minHeight: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "24px",
    padding: "32px",
    borderRadius: "12px",
    backgroundColor: "#131413",
  },
  messageMark: {
    width: "48px",
    height: "64px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "6px",
    color: colors.accent,
    backgroundColor: "#213326",
    fontSize: "24px",
    boxShadow: "7px 5px 0 #1b231d",
  },
  messageTitle: { color: "#f4f1e8", fontSize: "22px", fontWeight: 400 },
  messageCopy: { margin: "10px 0 0", color: "#989b92", fontSize: "14px", lineHeight: 1.6 },
  error: { margin: 0, color: "#ef9a8f", fontSize: "13px" },
});
