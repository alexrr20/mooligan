import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import type { Ref } from "react";

import { Button } from "../../components/ui/button";
import { colors, pageInsets } from "../../styles/tokens.stylex.js";
import { ReturnNavigation } from "../cards/card-detail";
import type { CardDetailOrigin } from "../cards/card-detail-origin";
import { CatalogSetSymbol } from "../catalog/catalog-set-symbol";
import { formatSpoilerReleaseDate } from "./spoiler-ui-state";
import { useSpoilers } from "./use-spoilers";

type ProtectedPrinting = Extract<CatalogPrintingResult, { status: "protected" }>;

type ProtectedPreviewGateProps = {
  headingRef: Ref<HTMLHeadingElement>;
  origin: CardDetailOrigin | null;
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
          <span {...stylex.props(styles.code)}>{release.code}</span>
        </div>

        <div {...stylex.props(styles.content)}>
          <p {...stylex.props(styles.kicker)}>Spoiler protection</p>
          <h1
            ref={headingRef}
            {...stylex.props(styles.title)}
            id="protected-preview-heading"
            tabIndex={-1}
          >
            Protected preview
          </h1>
          <div {...stylex.props(styles.release)}>
            <div {...stylex.props(styles.releaseFact)}>
              <span {...stylex.props(styles.term)}>Release family</span>
              <strong {...stylex.props(styles.releaseName)}>{release.name}</strong>
            </div>
            <div {...stylex.props(styles.releaseFact)}>
              <span {...stylex.props(styles.term)}>Release date</span>
              <time {...stylex.props(styles.releaseDate)} dateTime={preview.releasedOn}>
                {formatSpoilerReleaseDate(preview.releasedOn)}
              </time>
            </div>
          </div>

          <div {...stylex.props(styles.actions)}>
            <div {...stylex.props(styles.action)}>
              <Button
                disabled={spoilers.busy}
                size="lg"
                type="button"
                onClick={() => spoilers.revealPrinting(preview.printingId)}
              >
                Reveal this printing
              </Button>
              <p {...stylex.props(styles.actionCopy)}>Reveal this exact printing only.</p>
            </div>
            <div {...stylex.props(styles.action)}>
              <Button
                disabled={spoilers.busy}
                size="lg"
                type="button"
                variant="secondary"
                onClick={() => spoilers.revealRelease(release.rootSetId)}
              >
                Reveal this release
              </Button>
              <p {...stylex.props(styles.actionCopy)}>
                Includes every current and future subset in this release family.
              </p>
            </div>
          </div>

          {spoilers.error ? (
            <p {...stylex.props(styles.error)} role="alert">
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
    paddingTop: "28px",
    paddingInline: pageInsets.inline,
    paddingBottom: "100px",
  },
  gate: {
    minHeight: "440px",
    padding: "48px",
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 670px)",
    alignContent: "center",
    gap: "40px",
    backgroundColor: "#131413",
    borderRadius: "12px",
    "@media (max-width: 700px)": {
      padding: "28px",
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: "24px",
    },
  },
  symbolColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "14px",
    "@media (max-width: 700px)": { alignItems: "start" },
  },
  code: { color: "#989b92", fontSize: "12px", textTransform: "uppercase", letterSpacing: ".06em" },
  content: { minWidth: 0 },
  kicker: { margin: "0 0 12px", color: colors.accent, fontSize: "13px" },
  title: {
    margin: 0,
    color: "#f4f1e8",
    fontSize: "clamp(28px, 3.2vw, 40px)",
    fontWeight: 500,
    letterSpacing: "-.03em",
    lineHeight: 1.15,
    outline: "none",
    ":focus-visible": { outline: `2px solid ${colors.accent}`, outlineOffset: "6px" },
  },
  release: { marginTop: "28px", display: "flex", flexWrap: "wrap", gap: "24px 40px" },
  term: { color: "#989b92", fontSize: "12px" },
  releaseFact: { display: "grid", alignContent: "start", gap: "8px" },
  releaseName: { color: "#dedfd5", fontSize: "16px", fontWeight: 400, lineHeight: 1.4 },
  releaseDate: { color: "#c6c8bd", fontSize: "14px", lineHeight: 1.5 },
  actions: {
    marginTop: "32px",
    display: "flex",
    alignItems: "start",
    flexWrap: "wrap",
    gap: "24px",
  },
  action: { display: "grid", gap: "10px" },
  actionCopy: { maxWidth: "250px", margin: 0, color: "#989b92", fontSize: "12px", lineHeight: 1.5 },
  error: { margin: "24px 0 0", color: "#ef9a8f", fontSize: "13px" },
});
