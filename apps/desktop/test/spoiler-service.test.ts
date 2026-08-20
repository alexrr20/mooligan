import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  protectSpoilerState,
  protectSpoilerVisibility,
  releaseProtectionTarget,
  SpoilerService,
} from "../electron/spoilers/service.ts";
import { WorkspaceStore } from "../electron/workspace/store.ts";

void test("the spoiler service publishes named actions and refreshes at local midnight", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-service-"));
  const workspace = new WorkspaceStore(join(directory, "workspace.sqlite"));
  let now = new Date(2026, 7, 19, 23, 59, 0);
  let scheduled: (() => void) | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const service = new SpoilerService(workspace, {
    clearTimer(timer) {
      timers.delete(timer);
      clearTimeout(timer);
    },
    now: () => now,
    setTimer(callback) {
      scheduled = callback;
      const timer = setTimeout(() => undefined, 60_000);
      timers.add(timer);
      return timer;
    },
  });

  try {
    assert.deepEqual(service.visibilitySnapshot(), {
      currentDate: localDate(now),
      policy: "protect",
      revealedPrintingIds: [],
      revealedRootSetIds: [],
      revision: 0,
    });

    const published: number[] = [];
    service.subscribe(({ revision }) => published.push(revision));
    assert.deepEqual(service.revealPrinting("printing-a").activePrintingIds, ["printing-a"]);
    assert.deepEqual(service.revealRelease("release-a").activeRootSetIds, ["release-a"]);
    assert.equal(service.setPolicy("show").policy, "show");
    assert.equal(published.length, 3);

    service.refresh();
    assert.equal(published.length, 3);

    now = new Date(2026, 7, 20, 0, 0, 0);
    assert.ok(scheduled);
    scheduled();
    assert.equal(service.visibilitySnapshot().currentDate, localDate(now));
    assert.equal(published.at(-1), service.snapshot().revision);
    assert.equal(published.length, 4);

    const protectedState = service.protectAll();
    assert.equal(protectedState.policy, "protect");
    assert.deepEqual(protectedState.activePrintingIds, []);
    assert.deepEqual(protectedState.activeRootSetIds, []);
  } finally {
    service.close();
    workspace.close();
    for (const timer of timers) clearTimeout(timer);
    await rm(directory, { force: true, recursive: true });
  }
});

void test("an unresolved workspace identity exposes only protected spoiler snapshots", () => {
  assert.deepEqual(
    protectSpoilerState({
      activePrintingIds: ["printing-a"],
      activeRootSetIds: ["release-a"],
      policy: "show",
      revision: 7,
    }),
    {
      activePrintingIds: [],
      activeRootSetIds: [],
      policy: "protect",
      revision: 7,
    },
  );
  assert.deepEqual(
    protectSpoilerVisibility({
      currentDate: "2026-08-19",
      policy: "show",
      revealedPrintingIds: ["printing-a"],
      revealedRootSetIds: ["release-a"],
      revision: 7,
    }),
    {
      currentDate: "2026-08-19",
      policy: "protect",
      revealedPrintingIds: [],
      revealedRootSetIds: [],
      revision: 7,
    },
  );
});

void test("catalog visibility reads fresh workspace state before a publish", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mooligan-spoiler-service-fresh-read-"));
  const workspace = new WorkspaceStore(join(directory, "workspace.sqlite"));
  const service = new SpoilerService(workspace);

  try {
    workspace.setSpoilerPolicy("show");
    assert.equal(service.snapshot().policy, "protect");
    assert.equal(service.visibilitySnapshot().policy, "show");
  } finally {
    service.close();
    workspace.close();
    await rm(directory, { force: true, recursive: true });
  }
});

void test("a stored release reveal remains removable after its catalog family disappears", () => {
  const state = {
    activePrintingIds: [],
    activeRootSetIds: ["missing-release"],
    policy: "protect" as const,
    revision: 3,
  };

  assert.equal(releaseProtectionTarget(state, "missing-release", null), "missing-release");
  assert.equal(releaseProtectionTarget(state, "unknown-release", null), null);
  assert.equal(releaseProtectionTarget(state, "child-release", "root-release"), "root-release");
});

function localDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
