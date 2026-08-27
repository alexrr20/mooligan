import assert from "node:assert/strict";
import { test } from "node:test";

import { createAnimationSpeedController } from "../src/dev/animation-speed.ts";

void test("animation speed scales running and future animations", () => {
  const running = [recordingAnimation(1), recordingAnimation(2)];
  const controller = createAnimationSpeedController(() => running);

  controller.setSpeed(0.5);
  assert.equal(running[0].playbackRate, 0.5);
  assert.equal(running[1].playbackRate, 1);

  const future = recordingAnimation(1);
  running.push(future);
  controller.register(future);
  assert.equal(future.playbackRate, 0.5);

  controller.setSpeed(0.2);
  assert.equal(running[0].playbackRate, 0.2);
  assert.equal(running[1].playbackRate, 0.4);
  assert.equal(future.playbackRate, 0.2);

  controller.setSpeed(1);
  assert.equal(running[0].playbackRate, 1);
  assert.equal(running[1].playbackRate, 2);
  assert.equal(future.playbackRate, 1);
});

void test("animation speed subscribers only run when the speed changes", () => {
  const controller = createAnimationSpeedController(() => []);
  let updates = 0;
  const unsubscribe = controller.subscribe(() => {
    updates += 1;
  });

  controller.setSpeed(1);
  controller.setSpeed(0.5);
  controller.setSpeed(0.5);
  assert.equal(updates, 1);

  unsubscribe();
  controller.setSpeed(0.2);
  assert.equal(updates, 1);
});

function recordingAnimation(playbackRate: number) {
  return {
    playbackRate,
    updatePlaybackRate(nextPlaybackRate: number) {
      this.playbackRate = nextPlaybackRate;
    },
  };
}
