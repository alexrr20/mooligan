import type { CatalogPrintingVisibility } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";

import { Button } from "../../components/button";
import { typography } from "../../styles/typography";
import { getPrintingProtectionControl } from "./spoiler-ui-state";
import { useSpoilers } from "./use-spoilers";

type PrintingSpoilerControlProps = {
  printingId: string;
  visibility: CatalogPrintingVisibility;
};

export function PrintingSpoilerControl({ printingId, visibility }: PrintingSpoilerControlProps) {
  const control = getPrintingProtectionControl(visibility);
  const spoilers = useSpoilers();

  if (control.kind === "hidden") {
    return null;
  }

  return (
    <section {...stylex.props(styles.section)} aria-label="Spoiler protection for this printing">
      <div {...stylex.props(styles.copy)}>
        <span {...stylex.props(typography.label, styles.label)}>Preview visibility</span>
        <p
          {...stylex.props(typography.bodySmall, styles.description)}
          id="printing-protection-description"
        >
          {control.description}
        </p>
      </div>
      <Button
        aria-describedby="printing-protection-description"
        disabled={control.disabled || spoilers.busy}
        size="small"
        type="button"
        variant="secondary"
        onClick={() => spoilers.protectPrinting(printingId)}
      >
        {control.label}
      </Button>
      {spoilers.error ? (
        <p {...stylex.props(typography.bodySmall, styles.error)} role="alert">
          The preview choice could not be saved. Try again.
        </p>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  section: {
    minHeight: "72px",
    padding: "15px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "16px",
    borderBottom: "1px solid #34362f",
    backgroundColor: "#171914",
  },
  copy: {
    minWidth: 0,
    display: "grid",
    gap: "7px",
  },
  label: {
    color: "#85887e",
  },
  description: {
    maxWidth: "460px",
    margin: 0,
    color: "#a6a89d",
  },
  error: {
    width: "100%",
    margin: 0,
    color: "#ef9a8f",
  },
});
