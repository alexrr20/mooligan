import type { CatalogPrintingVisibility } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";

import { Button } from "../../components/ui/button";
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
        <span {...stylex.props(styles.label)}>Preview visibility</span>
        <p {...stylex.props(styles.description)} id="printing-protection-description">
          {control.description}
        </p>
      </div>
      <Button
        aria-describedby="printing-protection-description"
        disabled={control.disabled || spoilers.busy}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => spoilers.protectPrinting(printingId)}
      >
        {control.label}
      </Button>
      {spoilers.error ? (
        <p {...stylex.props(styles.error)} role="alert">
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
    marginTop: "24px",
    borderRadius: "10px",
    backgroundColor: "#142018",
  },
  copy: {
    minWidth: 0,
    display: "grid",
    gap: "7px",
  },
  label: {
    color: "#b0bdaf",
    fontSize: "13px",
  },
  description: {
    maxWidth: "460px",
    margin: 0,
    color: "#989b92",
    fontSize: "12px",
    lineHeight: 1.5,
  },
  error: {
    width: "100%",
    margin: 0,
    color: "#ef9a8f",
    fontSize: "12px",
  },
});
