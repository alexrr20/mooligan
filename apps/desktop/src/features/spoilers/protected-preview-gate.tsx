import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import type { Ref } from "react";

import { Button } from "../../components/button";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
import { ReturnNavigation } from "../cards/card-detail";
import type { CatalogSearchOrigin } from "../search/catalog-search-origin";
import { CatalogSetSymbol } from "../catalog/catalog-set-symbol";
import { formatSpoilerReleaseDate } from "./spoiler-ui-state";
import { useSpoilers } from "./use-spoilers";

type ProtectedPrinting = Extract<CatalogPrintingResult, { status: "protected" }>;

type ProtectedPreviewGateProps = {
  headingRef: Ref<HTMLHeadingElement>;
  origin: CatalogSearchOrigin | null;
  preview: ProtectedPrinting;
};

export function ProtectedPreviewGate({ headingRef, origin, preview }: ProtectedPreviewGateProps) {
  const spoilers = useSpoilers();
  const release = preview.release;

  return (
    <article {...stylex.props(styles.page)} aria-labelledby="protected-preview-heading">
      <ReturnNavigation origin={origin} />

      <section {...stylex.props(styles.gate)}>
        <div {...stylex.props(styles.symbolColumn)}>
          <CatalogSetSymbol code={release.code} size="large" symbol={release.symbol} />
          <span {...stylex.props(typography.label, styles.code)}>{release.code}</span>
        </div>

        <div {...stylex.props(styles.content)}>
          <p {...stylex.props(typography.label, styles.kicker)}>Spoiler protection</p>
          <h1
            ref={headingRef}
            {...stylex.props(styles.title)}
            id="protected-preview-heading"
            tabIndex={-1}
          >
            Protected preview.
          </h1>
          <div {...stylex.props(styles.release)}>
            <div {...stylex.props(styles.releaseFact)}>
              <span {...stylex.props(typography.label, styles.term)}>Release family</span>
              <strong {...stylex.props(styles.releaseName)}>{release.name}</strong>
            </div>
            <div {...stylex.props(styles.releaseFact)}>
              <span {...stylex.props(typography.label, styles.term)}>Release date</span>
              <time {...stylex.props(styles.releaseDate)} dateTime={preview.releasedOn}>
                {formatSpoilerReleaseDate(preview.releasedOn)}
              </time>
            </div>
          </div>

          <div {...stylex.props(styles.actions)}>
            <div {...stylex.props(styles.action)}>
              <Button
                disabled={spoilers.busy}
                size="large"
                type="button"
                onClick={() => spoilers.revealPrinting(preview.printingId)}
              >
                Reveal this printing
              </Button>
              <p {...stylex.props(typography.bodySmall, styles.actionCopy)}>
                Reveal this exact printing only.
              </p>
            </div>
            <div {...stylex.props(styles.action)}>
              <Button
                disabled={spoilers.busy}
                size="large"
                type="button"
                variant="secondary"
                onClick={() => spoilers.revealRelease(release.rootSetId)}
              >
                Reveal this release
              </Button>
              <p {...stylex.props(typography.bodySmall, styles.actionCopy)}>
                Includes every current and future subset in this release family.
              </p>
            </div>
          </div>

          {spoilers.error ? (
            <p {...stylex.props(typography.bodySmall, styles.error)} role="alert">
              The preview choice could not be saved. Try again.
            </p>
          ) : null}
        </div>
      </section>
    </article>
  );
}

const styles = stylex.create({
  page: {
    width: "100%",
    maxWidth: "1480px",
    minHeight: "100%",
    marginInline: "auto",
    padding: {
      default: "32px clamp(30px, 5vw, 76px) 78px",
      "@media (max-width: 820px)": "28px 28px 58px",
    },
  },
  gate: {
    minHeight: "min(590px, calc(100vh - 150px))",
    paddingBlock: {
      default: "72px",
      "@media (max-width: 820px)": "52px",
    },
    display: "grid",
    gridTemplateColumns: {
      default: "116px minmax(0, 670px)",
      "@media (max-width: 620px)": "1fr",
    },
    alignContent: "center",
    gap: {
      default: "clamp(38px, 6vw, 84px)",
      "@media (max-width: 620px)": "34px",
    },
    borderTop: "1px solid #55584f",
    borderBottom: "1px solid #34362f",
  },
  symbolColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "15px",
  },
  code: {
    color: colors.accent,
  },
  content: {
    minWidth: 0,
  },
  kicker: {
    margin: "0 0 18px",
    color: colors.accent,
  },
  title: {
    maxWidth: "650px",
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(44px, 6vw, 76px)",
    fontWeight: 400,
    letterSpacing: "-0.052em",
    lineHeight: 0.94,
    outline: "none",
    ":focus-visible": {
      outlineWidth: "1px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "8px",
    },
  },
  release: {
    maxWidth: "650px",
    marginTop: "36px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1.2fr) minmax(170px, 0.8fr)",
      "@media (max-width: 620px)": "1fr",
    },
    gap: "1px",
    borderBlock: "1px solid #34362f",
    backgroundColor: "#34362f",
  },
  term: {
    color: "#85887e",
  },
  releaseFact: {
    minHeight: "86px",
    padding: "17px 18px",
    display: "grid",
    alignContent: "center",
    gap: "8px",
    backgroundColor: "#11120f",
  },
  releaseName: {
    color: "#e1ded5",
    fontSize: "16px",
    fontWeight: 400,
    lineHeight: 1.25,
  },
  releaseDate: {
    color: "#d7d5cc",
    fontSize: "11px",
    lineHeight: 1.4,
  },
  actions: {
    marginTop: "32px",
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "24px",
  },
  action: {
    display: "grid",
    gap: "8px",
  },
  actionCopy: {
    maxWidth: "250px",
    margin: 0,
    color: "#85887e",
  },
  error: {
    margin: "24px 0 0",
    color: "#ef9a8f",
  },
});
