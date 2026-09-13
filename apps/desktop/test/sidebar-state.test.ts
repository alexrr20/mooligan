import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isSidebarShortcut,
  readSidebarCookie,
  sidebarCookie,
  sidebarResize,
} from "../src/lib/sidebar-state.ts";

void test("sidebar drag clamps the width and can recover from a collapse preview", () => {
  assert.deepEqual(sidebarResize(240, 50), { open: true, width: 290 });
  assert.deepEqual(sidebarResize(240, 500), { open: true, width: 360 });
  assert.deepEqual(sidebarResize(240, -100), { open: true, width: 160 });
  assert.deepEqual(sidebarResize(240, -137), { open: false, width: 160 });
  assert.deepEqual(sidebarResize(240, -136), { open: true, width: 160 });
  assert.deepEqual(sidebarResize(240, -80), { open: true, width: 160 });
});

void test("sidebar cookies restore only the desktop state and expire after one week", () => {
  assert.equal(readSidebarCookie(""), true);
  assert.equal(readSidebarCookie("other=false; sidebar_state=false"), false);
  assert.equal(readSidebarCookie("sidebar_state=true; other=false"), true);
  assert.equal(readSidebarCookie("other_sidebar_state=false"), true);
  assert.equal(readSidebarCookie(sidebarCookie(false)), false);
  assert.match(sidebarCookie(true), /^sidebar_state=true; path=\/; max-age=604800; SameSite=Lax$/);
});

void test("sidebar shortcut ignores typing, held keys, composition, and modified browser shortcuts", () => {
  const event = {
    key: "[",
    defaultPrevented: false,
    repeat: false,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
  };
  assert.equal(isSidebarShortcut(event, "[", false), true);
  assert.equal(isSidebarShortcut(event, "]", false), false);
  assert.equal(isSidebarShortcut(event, null, false), false);
  assert.equal(isSidebarShortcut(event, "[", true), false);
  for (const flag of [
    "defaultPrevented",
    "repeat",
    "isComposing",
    "metaKey",
    "ctrlKey",
    "altKey",
    "shiftKey",
  ]) {
    assert.equal(isSidebarShortcut({ ...event, [flag]: true }, "[", false), false);
  }
  assert.equal(isSidebarShortcut({ ...event, key: "B" }, "b", false), true);
});
