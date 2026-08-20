import type { SpoilerRevealSummary, SpoilerState } from "@mooligan/domain/spoilers";
import { Switch } from "@base-ui/react/switch";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { Button } from "../../components/button";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
import {
  getRevealSummaryProtectionControl,
  revealSummaryActionAccessibleName,
} from "./spoiler-ui-state";
import { useSpoilerRevealSummaries } from "./use-spoiler-reveal-summaries";
import { useSpoilers } from "./use-spoilers";

export function SpoilerSettings() {
  const spoilers = useSpoilers();
  const reveals = useSpoilerRevealSummaries();
  const alwaysShow = spoilers.state.policy === "show";
  const hasRevealSummaries =
    reveals.summaries.printings.length + reveals.summaries.releases.length > 0;

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="spoiler-heading">
      <div {...stylex.props(styles.intro)}>
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Catalog / Spoilers</p>
          <h2 {...stylex.props(typography.pageTitle, styles.title)} id="spoiler-heading">
            Protect upcoming cards.
          </h2>
        </div>
        <p {...stylex.props(typography.body, styles.introCopy)}>
          Mooligan hides previews by default. Reveal one printing, a complete release family, or
          every preview without changing the local catalog.
        </p>
      </div>

      <div {...stylex.props(styles.policy)}>
        <div {...stylex.props(styles.policyCopy)}>
          <strong {...stylex.props(typography.bodyLarge, styles.policyTitle)}>
            Always show previews
          </strong>
          <span {...stylex.props(typography.bodySmall, styles.policyDescription)}>
            Turning this off restores the narrower printing and release choices below.
          </span>
        </div>
        <Switch.Root
          {...stylex.props(styles.switchRoot, alwaysShow && styles.switchRootChecked)}
          aria-label="Always show previews"
          checked={alwaysShow}
          disabled={spoilers.busy || spoilers.loading}
          onCheckedChange={(checked) => spoilers.setPolicy(checked ? "show" : "protect")}
        >
          <Switch.Thumb
            {...stylex.props(styles.switchThumb, alwaysShow && styles.switchThumbChecked)}
          />
        </Switch.Root>
      </div>

      <div {...stylex.props(styles.reveals)}>
        <div {...stylex.props(styles.revealHeading)}>
          <div>
            <span {...stylex.props(typography.label, styles.revealKicker)}>Active choices</span>
            <h3 {...stylex.props(typography.heading, styles.revealTitle)}>Revealed early</h3>
          </div>
          <Button
            disabled={spoilers.busy || spoilers.loading}
            size="small"
            type="button"
            variant="secondary"
            onClick={() => spoilers.protectAll()}
          >
            Protect all previews
          </Button>
        </div>

        {reveals.error ? (
          <p {...stylex.props(typography.bodySmall, styles.inlineError)} role="alert">
            {reveals.error}
          </p>
        ) : reveals.loading ? (
          <p {...stylex.props(typography.bodySmall, styles.empty)} role="status">
            Reading reveal choices…
          </p>
        ) : hasRevealSummaries ? (
          <div {...stylex.props(styles.revealGroups)}>
            <RevealGroup
              label="Printings"
              state={spoilers.state}
              summaries={reveals.summaries.printings}
              busy={spoilers.busy}
              onProtect={(summary) => spoilers.protectPrinting(summary.targetId)}
            />
            <RevealGroup
              label="Releases"
              state={spoilers.state}
              summaries={reveals.summaries.releases}
              busy={spoilers.busy}
              onProtect={(summary) => spoilers.protectRelease(summary.targetId)}
            />
          </div>
        ) : (
          <p {...stylex.props(typography.bodySmall, styles.empty)}>
            No individual printing or release reveals.
          </p>
        )}
      </div>

      {spoilers.error ? (
        <p {...stylex.props(typography.bodySmall, styles.inlineError)} role="alert">
          The spoiler preference could not be saved. Try again.
        </p>
      ) : null}

      <div {...stylex.props(styles.statusRow)}>
        <span {...stylex.props(styles.statusDot)} aria-hidden="true" />
        <p {...stylex.props(typography.label, styles.status)} aria-live="polite">
          {spoilers.loading
            ? "Reading local spoiler settings…"
            : spoilers.busy
              ? "Saving locally…"
              : alwaysShow
                ? "All previews visible"
                : "Spoiler protection on"}
        </p>
      </div>
    </section>
  );
}

function RevealGroup({
  busy,
  label,
  onProtect,
  state,
  summaries,
}: {
  busy: boolean;
  label: string;
  onProtect: (summary: SpoilerRevealSummary) => void;
  state: SpoilerState;
  summaries: readonly SpoilerRevealSummary[];
}) {
  if (summaries.length === 0) {
    return null;
  }

  return (
    <section {...stylex.props(styles.group)} aria-label={`Revealed ${label.toLowerCase()}`}>
      <h4 {...stylex.props(typography.label, styles.groupTitle)}>{label}</h4>
      <ul {...stylex.props(styles.list)}>
        {summaries.map((summary) => (
          <RevealRow
            key={`${summary.scope}:${summary.targetId}`}
            busy={busy}
            state={state}
            summary={summary}
            onProtect={() => onProtect(summary)}
          />
        ))}
      </ul>
    </section>
  );
}

function RevealRow({
  busy,
  onProtect,
  state,
  summary,
}: {
  busy: boolean;
  onProtect: () => void;
  state: SpoilerState;
  summary: SpoilerRevealSummary;
}) {
  const descriptionId = useId();
  const control = getRevealSummaryProtectionControl(state, summary);

  return (
    <li {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.rowCopy)}>
        <strong {...stylex.props(typography.bodyLarge, styles.rowLabel)}>{summary.label}</strong>
        {summary.detail ? (
          <span {...stylex.props(typography.bodySmall, styles.rowDetail)}>{summary.detail}</span>
        ) : null}
        <span {...stylex.props(typography.bodySmall, styles.rowReason)} id={descriptionId}>
          {control.description}
        </span>
      </div>
      <Button
        aria-describedby={descriptionId}
        aria-label={revealSummaryActionAccessibleName(summary)}
        disabled={busy || control.disabled}
        size="small"
        type="button"
        variant="ghost"
        onClick={onProtect}
      >
        {control.label}
      </Button>
    </li>
  );
}

const styles = stylex.create({
  section: {
    maxWidth: "980px",
    marginTop: "64px",
    borderTop: "1px solid #34362f",
    borderBottom: "1px solid #34362f",
  },
  intro: {
    paddingBlock: "26px 30px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(220px, 0.75fr) minmax(300px, 1fr)",
      "@media (max-width: 820px)": "1fr",
    },
    gap: {
      default: "56px",
      "@media (max-width: 820px)": "18px",
    },
    alignItems: "end",
  },
  kicker: {
    margin: "0 0 12px",
    color: colors.accent,
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
  },
  introCopy: {
    maxWidth: "520px",
    margin: 0,
    color: "#a6a89d",
  },
  policy: {
    minHeight: "96px",
    padding: "20px 22px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    borderTop: "1px solid #34362f",
    backgroundColor: "#171914",
  },
  policyCopy: {
    minWidth: 0,
    display: "grid",
    gap: "6px",
  },
  policyTitle: {
    color: "#f4f1e8",
  },
  policyDescription: {
    maxWidth: "560px",
    color: "#85887e",
  },
  switchRoot: {
    width: "42px",
    height: "24px",
    padding: "3px",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    border: "1px solid #55584f",
    borderRadius: "999px",
    backgroundColor: "#22241f",
    cursor: "pointer",
    transition: "background-color 160ms ease, border-color 160ms ease",
    ":focus-visible": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "4px",
    },
    ":disabled": {
      cursor: "wait",
      opacity: 0.55,
    },
  },
  switchRootChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "#a6a89d",
    transform: "translateX(0)",
    transition: "background-color 160ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)",
  },
  switchThumbChecked: {
    backgroundColor: "#1b1d19",
    transform: "translateX(18px)",
  },
  reveals: {
    borderTop: "1px solid #34362f",
  },
  revealHeading: {
    minHeight: "86px",
    padding: "18px 22px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
  },
  revealKicker: {
    display: "block",
    marginBottom: "7px",
    color: "#85887e",
  },
  revealTitle: {
    margin: 0,
    color: "#f4f1e8",
  },
  revealGroups: {
    borderTop: "1px solid #34362f",
  },
  group: {
    display: "grid",
    gridTemplateColumns: {
      default: "112px minmax(0, 1fr)",
      "@media (max-width: 620px)": "1fr",
    },
    borderBottom: "1px solid #34362f",
    ":last-child": {
      borderBottom: 0,
    },
  },
  groupTitle: {
    margin: 0,
    padding: "19px 18px",
    color: colors.accent,
    backgroundColor: "#11120f",
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  row: {
    minHeight: "82px",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    borderBottom: "1px solid #34362f",
    backgroundColor: "#171914",
    ":last-child": {
      borderBottom: 0,
    },
  },
  rowCopy: {
    minWidth: 0,
    display: "grid",
    gap: "4px",
  },
  rowLabel: {
    color: "#e1ded5",
    overflowWrap: "anywhere",
  },
  rowDetail: {
    color: "#85887e",
  },
  rowReason: {
    color: "#a6a89d",
  },
  empty: {
    margin: 0,
    padding: "22px",
    borderTop: "1px solid #34362f",
    color: "#85887e",
    backgroundColor: "#171914",
  },
  inlineError: {
    margin: 0,
    padding: "11px 22px",
    borderTop: "1px solid #5d332e",
    color: "#ef9a8f",
    backgroundColor: "rgba(170, 45, 34, 0.1)",
  },
  statusRow: {
    minHeight: "42px",
    paddingInline: "2px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    borderTop: "1px solid #34362f",
  },
  statusDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
  },
  status: {
    margin: 0,
    color: "#85887e",
  },
});
