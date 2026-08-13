import assert from "node:assert/strict";
import { test } from "node:test";

import { SearchImageLoading } from "../src/features/search/search-image-loading.ts";

type PendingTimer = {
  callback: () => void;
  delay: number;
};

function createHarness(ids: readonly string[]) {
  const activated: string[] = [];
  let timer: PendingTimer | undefined;
  const coordinator = new SearchImageLoading((id) => activated.push(id), {
    clearTimeout: (handle) => {
      if (handle === timer) {
        timer = undefined;
      }
    },
    setTimeout: (callback, delay) => {
      timer = { callback, delay };
      return timer;
    },
  });
  const generation = coordinator.reset(ids);

  return {
    activated,
    coordinator,
    generation,
    runTimeout() {
      const pending = timer;
      timer = undefined;
      pending?.callback();
      return pending?.delay;
    },
  };
}

void test("only initially visible images activate before they settle", () => {
  const harness = createHarness(["a", "b", "c", "d"]);

  harness.coordinator.initialVisible(["a", "c"], harness.generation);

  assert.deepEqual(harness.activated, ["a", "c"]);
});

void test("background loading waits for every initially visible image", () => {
  const harness = createHarness(["a", "b", "c"]);
  harness.coordinator.initialVisible(["a", "b"], harness.generation);

  harness.coordinator.settled("a", harness.generation);
  assert.deepEqual(harness.activated, ["a", "b"]);

  harness.coordinator.settled("b", harness.generation);
  assert.deepEqual(harness.activated, ["a", "b", "c"]);
});

void test("an errored visible image cannot block the background queue", () => {
  const harness = createHarness(["visible", "background"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);

  harness.coordinator.settled("visible", harness.generation);

  assert.deepEqual(harness.activated, ["visible", "background"]);
});

void test("exactly six background images activate at once", () => {
  const harness = createHarness(["visible", "1", "2", "3", "4", "5", "6", "7"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);

  harness.coordinator.settled("visible", harness.generation);

  assert.deepEqual(harness.activated, ["visible", "1", "2", "3", "4", "5", "6"]);
});

void test("settling a background image activates the next one in order", () => {
  const harness = createHarness(["visible", "1", "2", "3", "4", "5", "6", "7"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);
  harness.coordinator.settled("visible", harness.generation);

  harness.coordinator.settled("1", harness.generation);

  assert.deepEqual(harness.activated, ["visible", "1", "2", "3", "4", "5", "6", "7"]);
});

void test("a newly visible pending image is promoted immediately", () => {
  const harness = createHarness(["visible", "1", "2", "3", "4", "5", "6", "promoted", "last"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);

  harness.coordinator.visible(["promoted"], harness.generation);

  assert.deepEqual(harness.activated, ["visible", "promoted"]);
  harness.coordinator.settled("visible", harness.generation);
  assert.deepEqual(harness.activated, ["visible", "promoted", "1", "2", "3", "4", "5", "6"]);
});

void test("appended cards join the existing queue", () => {
  const harness = createHarness(["visible"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);
  harness.coordinator.settled("visible", harness.generation);

  harness.coordinator.append(["1", "2", "3", "4", "5", "6", "7"], harness.generation);

  assert.deepEqual(harness.activated, ["visible", "1", "2", "3", "4", "5", "6"]);
  harness.coordinator.settled("1", harness.generation);
  assert.deepEqual(harness.activated, ["visible", "1", "2", "3", "4", "5", "6", "7"]);
});

void test("reset ignores callbacks from an obsolete generation", () => {
  const harness = createHarness(["old-visible", "old-background"]);
  harness.coordinator.initialVisible(["old-visible"], harness.generation);
  const nextGeneration = harness.coordinator.reset(["new-visible", "new-background"]);
  harness.coordinator.initialVisible(["new-visible"], nextGeneration);

  harness.coordinator.settled("old-visible", harness.generation);
  assert.deepEqual(harness.activated, ["old-visible", "new-visible"]);

  harness.coordinator.settled("new-visible", nextGeneration);
  assert.deepEqual(harness.activated, ["old-visible", "new-visible", "new-background"]);
});

void test("the safety timeout releases the queue when a visible image hangs", () => {
  const harness = createHarness(["visible", "1", "2", "3", "4", "5", "6", "7"]);
  harness.coordinator.initialVisible(["visible"], harness.generation);

  assert.equal(harness.runTimeout(), 5_000);
  assert.deepEqual(harness.activated, ["visible", "1", "2", "3", "4", "5", "6"]);
});
