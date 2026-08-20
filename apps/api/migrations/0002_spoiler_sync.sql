CREATE TABLE workspace_spoiler_state (
  workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES sync_workspaces (id) ON DELETE CASCADE,
  policy TEXT NOT NULL CHECK (policy IN ('protect', 'show')),
  reset_generation INTEGER NOT NULL CHECK (reset_generation >= 0),
  seed_local_workspace_id TEXT NOT NULL,
  sync_version INTEGER NOT NULL CHECK (sync_version > 0),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE workspace_spoiler_decisions (
  workspace_id TEXT NOT NULL REFERENCES sync_workspaces (id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('printing', 'release')),
  target_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('protect', 'reveal')),
  reset_generation INTEGER NOT NULL CHECK (reset_generation >= 0),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, scope, target_id)
) STRICT;

CREATE INDEX workspace_spoiler_decisions_order
  ON workspace_spoiler_decisions (workspace_id, reset_generation, scope, target_id);

CREATE TABLE workspace_spoiler_operation_receipts (
  local_workspace_id TEXT PRIMARY KEY NOT NULL
    REFERENCES sync_workspace_bindings (local_workspace_id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
  snapshot_version INTEGER CHECK (snapshot_version IS NULL OR snapshot_version > 0),
  state_policy TEXT CHECK (state_policy IS NULL OR state_policy IN ('protect', 'show')),
  state_reset_generation INTEGER CHECK (
    state_reset_generation IS NULL OR state_reset_generation >= 0
  ),
  state_version INTEGER CHECK (state_version IS NULL OR state_version > 0),
  state_updated_at TEXT,
  CHECK (
    (
      completed = 0
      AND snapshot_version IS NULL
      AND state_policy IS NULL
      AND state_reset_generation IS NULL
      AND state_version IS NULL
      AND state_updated_at IS NULL
    )
    OR
    (
      completed = 1
      AND snapshot_version IS NOT NULL
      AND state_policy IS NOT NULL
      AND state_reset_generation IS NOT NULL
      AND state_version IS NOT NULL
      AND state_updated_at IS NOT NULL
    )
  )
) STRICT;

CREATE TABLE workspace_spoiler_operation_decisions (
  local_workspace_id TEXT NOT NULL
    REFERENCES workspace_spoiler_operation_receipts (local_workspace_id) ON DELETE CASCADE,
  response_index INTEGER NOT NULL CHECK (response_index >= 0),
  scope TEXT NOT NULL CHECK (scope IN ('printing', 'release')),
  target_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('protect', 'reveal')),
  reset_generation INTEGER NOT NULL CHECK (reset_generation >= 0),
  version INTEGER NOT NULL CHECK (version > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (local_workspace_id, scope, target_id),
  UNIQUE (local_workspace_id, response_index)
) STRICT;
