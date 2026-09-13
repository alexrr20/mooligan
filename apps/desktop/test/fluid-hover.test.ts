import assert from "node:assert/strict";
import { test } from "node:test";
import { pickNearest } from "../src/hooks/use-fluid-hover.ts";

const geometry = {
  axis: "y",
  rects: [0, 38, 76].map((top) => ({ top, left: 0, width: 240, height: 36 })),
  containerRect: { left: 10, top: 100, width: 240, height: 112 },
  scroll: { x: 0, y: 0 },
  border: { x: 0, y: 0 },
  layoutSize: { width: 240, height: 112 },
} as const;

void test("Fluid Hover keeps a target through row gaps and across the selected row", () => {
  const indices = [118, 136, 137, 138, 156, 174, 175, 176, 194].map((y) =>
    pickNearest({ ...geometry, point: { x: 40, y } }),
  );
  assert.deepEqual(indices, [0, 0, 0, 1, 1, 1, 1, 2, 2]);
  assert.equal(pickNearest({ ...geometry, point: { x: 40, y: 99 } }), 0);
  assert.equal(pickNearest({ ...geometry, point: { x: 40, y: 215 } }), 2);
});

void test("Fluid Hover skips disabled rows and handles transformed or scrolled containers", () => {
  assert.equal(
    pickNearest({ ...geometry, point: { x: 40, y: 156 }, isDisabled: (index) => index === 1 }),
    0,
  );
  assert.equal(
    pickNearest({ ...geometry, point: { x: 40, y: 156 }, isDisabled: () => true }),
    null,
  );
  assert.equal(pickNearest({ ...geometry, point: { x: 40, y: 118 }, scroll: { x: 0, y: 38 } }), 1);
  assert.equal(
    pickNearest({
      ...geometry,
      point: { x: 40, y: 128 },
      containerRect: { ...geometry.containerRect, width: 120, height: 56 },
    }),
    1,
  );
});
