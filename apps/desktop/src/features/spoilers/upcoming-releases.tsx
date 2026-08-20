import type { CatalogReleaseSummary } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { Button } from "../../components/button";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
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

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="upcoming-releases-heading">
      <header {...stylex.props(styles.header)}>
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Catalog / Upcoming</p>
          <h1 {...stylex.props(styles.title)} id="upcoming-releases-heading">
            Upcoming releases.
          </h1>
        </div>
        <p {...stylex.props(typography.body, styles.intro)}>
          Preview cards stay out of search until their release date. Reveal a release family here
          when you want to see it early.
        </p>
      </header>

      {upcoming.error ? (
        <ReleaseMessage mark="!" title="Upcoming releases unavailable">
          {upcoming.error}
        </ReleaseMessage>
      ) : upcoming.loading ? (
        <div {...stylex.props(styles.loading)} aria-label="Reading upcoming releases" role="status">
          <span {...stylex.props(styles.loadingSymbol)} aria-hidden="true" />
          <span {...stylex.props(typography.label, styles.loadingCopy)}>
            Reading local release calendar…
          </span>
        </div>
      ) : upcoming.releases.length === 0 ? (
        <ReleaseMessage mark="0" title="No upcoming releases">
          The installed catalog has no future release families.
        </ReleaseMessage>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {upcoming.releases.map((release) => (
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
      )}

      {spoilers.error ? (
        <p {...stylex.props(typography.bodySmall, styles.error)} role="alert">
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
      <div {...stylex.props(styles.identity)}>
        <CatalogSetSymbol code={release.code} symbol={release.symbol} />
        <div {...stylex.props(styles.names)}>
          <strong {...stylex.props(typography.heading, styles.name)}>{release.name}</strong>
          <span {...stylex.props(typography.label, styles.code)}>{release.code}</span>
        </div>
      </div>

      <div {...stylex.props(styles.date)}>
        <span {...stylex.props(typography.label, styles.term)}>Next release</span>
        <time
          {...stylex.props(typography.bodySmall, styles.dateValue)}
          dateTime={release.nextReleaseOn}
        >
          {formatSpoilerReleaseDate(release.nextReleaseOn)}
        </time>
      </div>

      <div {...stylex.props(styles.action)}>
        <Button
          aria-describedby={descriptionId}
          aria-label={releaseActionAccessibleName(control.label, release.name)}
          disabled={busy || control.disabled}
          size="small"
          type="button"
          variant={control.action === "reveal" ? "primary" : "secondary"}
          onClick={control.action === "reveal" ? onReveal : onProtect}
        >
          {control.label}
        </Button>
        <p {...stylex.props(typography.bodySmall, styles.actionCopy)} id={descriptionId}>
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
        <p {...stylex.props(typography.bodySmall, styles.messageCopy)}>{children}</p>
      </div>
    </div>
  );
}

const styles = stylex.create({
  section: {
    width: "100%",
    maxWidth: "1120px",
  },
  header: {
    paddingBlock: "26px 38px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(260px, 0.85fr) minmax(320px, 1fr)",
      "@media (max-width: 820px)": "1fr",
    },
    alignItems: "end",
    gap: {
      default: "64px",
      "@media (max-width: 820px)": "20px",
    },
    borderTop: "1px solid #55584f",
    borderBottom: "1px solid #34362f",
  },
  kicker: {
    margin: "0 0 13px",
    color: colors.accent,
  },
  title: {
    maxWidth: "660px",
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(42px, 6vw, 72px)",
    fontWeight: 400,
    letterSpacing: "-0.052em",
    lineHeight: 0.94,
  },
  intro: {
    maxWidth: "520px",
    margin: 0,
    color: "#a6a89d",
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  item: {
    minHeight: "128px",
    paddingBlock: "20px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(260px, 1fr) minmax(160px, 0.48fr) minmax(280px, 0.8fr)",
      "@media (max-width: 900px)": "minmax(240px, 1fr) minmax(150px, 0.65fr)",
      "@media (max-width: 620px)": "1fr",
    },
    alignItems: "center",
    gap: {
      default: "30px",
      "@media (max-width: 620px)": "20px",
    },
    borderBottom: "1px solid #34362f",
  },
  identity: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  names: {
    minWidth: 0,
    display: "grid",
    gap: "8px",
  },
  name: {
    overflowWrap: "anywhere",
    color: "#f4f1e8",
  },
  code: {
    color: colors.accent,
  },
  date: {
    display: "grid",
    gap: "8px",
  },
  term: {
    color: "#85887e",
  },
  dateValue: {
    color: "#d7d5cc",
  },
  action: {
    display: "grid",
    justifyItems: "start",
    gap: "8px",
    "@media (max-width: 900px) and (min-width: 621px)": {
      gridColumn: "1 / -1",
      paddingLeft: "54px",
    },
  },
  actionCopy: {
    maxWidth: "340px",
    margin: 0,
    color: "#85887e",
  },
  loading: {
    minHeight: "180px",
    display: "flex",
    alignItems: "center",
    gap: "18px",
    borderBottom: "1px solid #34362f",
  },
  loadingSymbol: {
    width: "38px",
    height: "38px",
    border: "1px solid #55584f",
    borderRadius: "50%",
    backgroundColor: "#171914",
  },
  loadingCopy: {
    color: "#85887e",
  },
  message: {
    minHeight: "180px",
    display: "flex",
    alignItems: "center",
    gap: "22px",
    borderBottom: "1px solid #34362f",
  },
  messageMark: {
    width: "54px",
    height: "72px",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    borderRadius: "3px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "9px",
    boxShadow: "6px 6px 0 #242620",
  },
  messageTitle: {
    color: "#f4f1e8",
    fontSize: "22px",
    fontWeight: 400,
  },
  messageCopy: {
    margin: "6px 0 0",
    color: "#a6a89d",
  },
  error: {
    margin: "18px 0 0",
    color: "#ef9a8f",
  },
});
