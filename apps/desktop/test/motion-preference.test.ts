import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readMotionPreference,
  writeMotionPreference,
} from "../src/features/preferences/use-motion-preference.ts";

void test("motion preference defaults to the system setting", () => {
  assert.equal(readMotionPreference({ getItem: () => null }), "system");
  assert.equal(readMotionPreference({ getItem: () => "invalid" }), "system");
  assert.equal(readMotionPreference({ getItem: () => "system" }), "system");
  assert.equal(readMotionPreference({ getItem: () => "reduced" }), "reduced");
  assert.equal(readMotionPreference({ getItem: () => "full" }), "full");
});

void test("motion preference tolerates unavailable local storage", () => {
  assert.equal(
    readMotionPreference({
      getItem: () => {
        throw new Error("unavailable");
      },
    }),
    "system",
  );
  assert.doesNotThrow(() =>
    writeMotionPreference(
      {
        setItem: () => {
          throw new Error("unavailable");
        },
      },
      "reduced",
    ),
  );
});

void test("motion preference is stored on the device", () => {
  let stored: [string, string] | null = null;

  writeMotionPreference(
    {
      setItem: (key, value) => {
        stored = [key, value];
      },
    },
    "full",
  );

  assert.deepEqual(stored, ["mooligan.motion", "full"]);
});
