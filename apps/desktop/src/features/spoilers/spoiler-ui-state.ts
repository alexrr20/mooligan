import type {
  CatalogPrintingVisibility,
  SpoilerRevealSummary,
  SpoilerState,
} from "@mooligan/domain/spoilers";

export type PrintingProtectionControl =
  | { kind: "hidden" }
  | {
      description: string;
      disabled: boolean;
      kind: "protect";
      label: "Protect this printing";
    };

export type ReleaseProtectionControl = {
  action: "protect" | "reveal";
  description: string;
  disabled: boolean;
  label: "Protect this release" | "Reveal this release";
};

export type RevealSummaryProtectionControl = {
  description: string;
  disabled: boolean;
  label: "Protect printing" | "Protect release";
};

export function getPrintingProtectionControl(
  visibility: CatalogPrintingVisibility,
): PrintingProtectionControl {
  if (visibility.reason === "released") {
    return { kind: "hidden" };
  }

  if (visibility.reason === "global") {
    return {
      description: 'Turn off "Always show previews" before protecting this printing.',
      disabled: true,
      kind: "protect",
      label: "Protect this printing",
    };
  }

  if (visibility.reason === "release") {
    return {
      description: `Protect ${visibility.release.name} before protecting this printing.`,
      disabled: true,
      kind: "protect",
      label: "Protect this printing",
    };
  }

  return {
    description: "Hide this exact printing again. Other reveal choices stay unchanged.",
    disabled: false,
    kind: "protect",
    label: "Protect this printing",
  };
}

export function getReleaseProtectionControl(
  state: SpoilerState,
  rootSetId: string,
): ReleaseProtectionControl {
  if (state.policy === "show") {
    return {
      action: "protect",
      description: 'Turn off "Always show previews" before protecting one release.',
      disabled: true,
      label: "Protect this release",
    };
  }

  if (state.activeRootSetIds.includes(rootSetId)) {
    return {
      action: "protect",
      description: "Hide this release family again. Exact printing reveals stay unchanged.",
      disabled: false,
      label: "Protect this release",
    };
  }

  return {
    action: "reveal",
    description: "Reveal this release and every current or future subset in its family.",
    disabled: false,
    label: "Reveal this release",
  };
}

export function getRevealSummaryProtectionControl(
  state: SpoilerState,
  summary: SpoilerRevealSummary,
): RevealSummaryProtectionControl {
  const label = summary.scope === "printing" ? "Protect printing" : "Protect release";

  if (state.policy === "show") {
    return {
      description: `Turn off "Always show previews" before protecting this ${summary.scope}.`,
      disabled: true,
      label,
    };
  }

  if (
    summary.scope === "printing" &&
    summary.rootSetId !== undefined &&
    state.activeRootSetIds.includes(summary.rootSetId)
  ) {
    return {
      description: "Protect its release family before protecting this printing.",
      disabled: true,
      label,
    };
  }

  return {
    description:
      summary.scope === "printing"
        ? "Hide this exact printing again."
        : "Hide this release family again.",
    disabled: false,
    label,
  };
}

export function formatSpoilerReleaseDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }).format(date);
}

export function releaseActionAccessibleName(label: string, releaseName: string) {
  return `${label}: ${releaseName}`;
}

export function revealSummaryActionAccessibleName(summary: SpoilerRevealSummary) {
  return `Protect ${summary.scope === "printing" ? "printing" : "release"}: ${summary.label}`;
}
