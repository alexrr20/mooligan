import assert from "node:assert/strict";
import { test } from "node:test";

import { SpoilerProjection } from "../electron/spoilers/projection.ts";

const workspaceId = "42aefc23-ea80-4e4a-8cbc-8905f405ccf8";

void test("the catalog stays fully protected until a complete projection arrives", () => {
  const projection = new SpoilerProjection(() => workspaceId);
  try {
    assert.deepEqual(projection.visibilitySnapshot(), {
      currentDate: localDate(new Date()),
      policy: "protect",
      revealedPrintingIds: [],
      revealedRootSetIds: [],
      revision: 0,
    });

    const connection = projection.connect(7, workspaceId);
    projection.replace(7, {
      ...connection,
      decisions: [
        { scope: "printing", state: "reveal", targetId: "printing-one" },
        { scope: "release", state: "protect", targetId: "release-one" },
      ],
      policy: "show",
      revision: 1,
    });

    assert.deepEqual(projection.visibilitySnapshot(), {
      currentDate: localDate(new Date()),
      policy: "show",
      revealedPrintingIds: ["printing-one"],
      revealedRootSetIds: [],
      revision: 2,
    });
  } finally {
    projection.close();
  }
});

void test("revision gaps and wrong renderer sessions fail closed until a full replacement", () => {
  const projection = new SpoilerProjection(() => workspaceId);
  try {
    const connection = projection.connect(7, workspaceId);
    projection.replace(7, {
      ...connection,
      decisions: [{ scope: "release", state: "reveal", targetId: "release-one" }],
      policy: "protect",
      revision: 1,
    });

    assert.deepEqual(
      projection.apply(7, {
        ...connection,
        decisions: [],
        policy: "show",
        revision: 3,
      }),
      { status: "resync-required" },
    );
    assert.equal(projection.visibilitySnapshot().policy, "protect");
    assert.deepEqual(projection.visibilitySnapshot().revealedRootSetIds, []);

    assert.deepEqual(
      projection.replace(8, {
        ...connection,
        decisions: [],
        policy: "show",
        revision: 4,
      }),
      { status: "resync-required" },
    );
    assert.equal(projection.visibilitySnapshot().policy, "protect");

    assert.deepEqual(
      projection.replace(7, {
        ...connection,
        decisions: [{ scope: "printing", state: "reveal", targetId: "printing-two" }],
        policy: "protect",
        revision: 4,
      }),
      { revision: 4, status: "applied" },
    );
    assert.deepEqual(projection.visibilitySnapshot().revealedPrintingIds, ["printing-two"]);
  } finally {
    projection.close();
  }
});

void test("renderer replacement returns catalog and image authorization to full protection", () => {
  const projection = new SpoilerProjection(() => workspaceId);
  try {
    const connection = projection.connect(7, workspaceId);
    projection.replace(7, {
      ...connection,
      decisions: [],
      policy: "show",
      revision: 1,
    });

    projection.rendererReplaced(7);
    assert.equal(projection.visibilitySnapshot().policy, "protect");
  } finally {
    projection.close();
  }
});

void test("a Workspace switch discards accepted reveals before the prior Workspace returns", () => {
  let activeWorkspaceId = workspaceId;
  const projection = new SpoilerProjection(() => activeWorkspaceId);
  try {
    const connection = projection.connect(7, workspaceId);
    projection.replace(7, {
      ...connection,
      decisions: [{ scope: "printing", state: "reveal", targetId: "printing-one" }],
      policy: "show",
      revision: 1,
    });

    activeWorkspaceId = "72aa0d46-98f5-4fd5-8b2b-77e10ecacc56";
    projection.workspaceChanged();
    activeWorkspaceId = workspaceId;

    assert.equal(projection.visibilitySnapshot().policy, "protect");
    assert.deepEqual(projection.visibilitySnapshot().revealedPrintingIds, []);
  } finally {
    projection.close();
  }
});

void test("invalid and wrong-workspace updates discard the accepted projection", () => {
  let activeWorkspaceId = workspaceId;
  const projection = new SpoilerProjection(() => activeWorkspaceId);
  try {
    const connection = projection.connect(7, workspaceId);
    projection.replace(7, {
      ...connection,
      decisions: [],
      policy: "show",
      revision: 1,
    });

    projection.rejectInvalidUpdate(7);
    assert.equal(projection.visibilitySnapshot().policy, "protect");

    projection.replace(7, {
      ...connection,
      decisions: [],
      policy: "show",
      revision: 2,
    });
    activeWorkspaceId = "72aa0d46-98f5-4fd5-8b2b-77e10ecacc56";
    assert.equal(projection.visibilitySnapshot().policy, "protect");
  } finally {
    projection.close();
  }
});

void test("the main-process local date changes visibility authorization at midnight", () => {
  let now = new Date(2026, 7, 19, 23, 59, 0);
  let scheduled: (() => void) | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const projection = new SpoilerProjection(() => workspaceId, {
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
    const before = projection.visibilitySnapshot();
    now = new Date(2026, 7, 20, 0, 0, 0);
    assert.ok(scheduled);
    scheduled();
    const after = projection.visibilitySnapshot();

    assert.equal(before.currentDate, "2026-08-19");
    assert.equal(after.currentDate, "2026-08-20");
    assert.ok(after.revision > before.revision);
  } finally {
    projection.close();
    for (const timer of timers) clearTimeout(timer);
  }
});

function localDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
