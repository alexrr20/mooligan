import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CatalogPrintingVisibility,
  CatalogReleaseSummary,
  SpoilerRevealSummary,
  SpoilerState,
} from "@mooligan/domain/spoilers";

import {
  formatSpoilerReleaseDate,
  getPrintingProtectionControl,
  getReleaseProtectionControl,
  getRevealSummaryProtectionControl,
  releaseActionAccessibleName,
  revealSummaryActionAccessibleName,
} from "../src/features/spoilers/spoiler-ui-state.ts";

const release: CatalogReleaseSummary = {
  code: "eoe",
  name: "Edge of Eternities",
  nextReleaseOn: "2027-10-05",
  rootSetId: "release-1",
  symbol: { setId: "release-1" },
};

const protectedState: SpoilerState = {
  activePrintingIds: [],
  activeRootSetIds: [],
  policy: "protect",
  revision: 1,
};

void test("printing protection follows the catalog visibility reason", () => {
  assert.deepEqual(getPrintingProtectionControl({ reason: "released" }), { kind: "hidden" });
  assert.deepEqual(getPrintingProtectionControl({ reason: "printing", release }), {
    description: "Hide this exact printing again. Other reveal choices stay unchanged.",
    disabled: false,
    kind: "protect",
    label: "Protect this printing",
  });

  const releaseControl = getPrintingProtectionControl({ reason: "release", release });
  assert.equal(releaseControl.kind, "protect");
  assert.equal(releaseControl.kind === "protect" && releaseControl.disabled, true);
  assert.match(
    releaseControl.kind === "protect" ? releaseControl.description : "",
    /Protect Edge of Eternities before/u,
  );

  const globalControl = getPrintingProtectionControl({ reason: "global", release });
  assert.equal(globalControl.kind, "protect");
  assert.equal(globalControl.kind === "protect" && globalControl.disabled, true);
  assert.match(
    globalControl.kind === "protect" ? globalControl.description : "",
    /Always show previews/u,
  );
});

void test("release controls preserve broader global consent", () => {
  assert.deepEqual(getReleaseProtectionControl(protectedState, release.rootSetId), {
    action: "reveal",
    description: "Reveal this release and every current or future subset in its family.",
    disabled: false,
    label: "Reveal this release",
  });

  const revealed = {
    ...protectedState,
    activeRootSetIds: [release.rootSetId],
  } satisfies SpoilerState;
  assert.equal(getReleaseProtectionControl(revealed, release.rootSetId).action, "protect");
  assert.equal(getReleaseProtectionControl(revealed, release.rootSetId).disabled, false);

  const global = { ...revealed, policy: "show" } satisfies SpoilerState;
  assert.equal(getReleaseProtectionControl(global, release.rootSetId).action, "protect");
  assert.equal(getReleaseProtectionControl(global, release.rootSetId).disabled, true);
});

void test("settings blocks a printing action while its release is revealed", () => {
  const summary: SpoilerRevealSummary = {
    label: "Future Sight",
    rootSetId: release.rootSetId,
    scope: "printing",
    targetId: "printing-1",
  };
  const state = {
    ...protectedState,
    activePrintingIds: [summary.targetId],
    activeRootSetIds: [release.rootSetId],
  } satisfies SpoilerState;

  assert.deepEqual(getRevealSummaryProtectionControl(state, summary), {
    description: "Protect its release family before protecting this printing.",
    disabled: true,
    label: "Protect printing",
  });
  assert.equal(
    getRevealSummaryProtectionControl({ ...state, policy: "show" }, summary).disabled,
    true,
  );
});

void test("release dates and action names remain explicit", () => {
  const visibility: CatalogPrintingVisibility = { reason: "printing", release };
  assert.equal(getPrintingProtectionControl(visibility).kind, "protect");
  assert.equal(formatSpoilerReleaseDate("2027-10-05"), "October 5, 2027");
  assert.equal(
    releaseActionAccessibleName("Reveal this release", release.name),
    "Reveal this release: Edge of Eternities",
  );
  assert.equal(
    revealSummaryActionAccessibleName({
      label: "Future Sight",
      scope: "printing",
      targetId: "printing-1",
    }),
    "Protect printing: Future Sight",
  );
});
