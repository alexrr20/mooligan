# LiveStore release gates

Status: active

Updated: 2026-08-26

This record defines the failure and scale checks required before a Mooligan
desktop release. Automated tests run on every change. Packaged-app drills run on
each supported operating system before a public release because Node tests
cannot reproduce Electron OPFS, renderer termination, system quota, or a signed
installer.

## Data-loss invariant

The last confirmed local LiveStore event log is authoritative. A failure may
pause synchronization, invalidate a catalog projection, or require an app
restart. It must not clear or replace that event log without a separate action
that the user chose.

The catalog Collection projection and spoiler projection are disposable. Their
failure must make reads unavailable or protected until the renderer supplies a
complete replacement. A backend identifier mismatch uses LiveStore's
`shutdown` policy. The `reset` policy is forbidden because it clears local
state.

## Automated failure coverage

| Failure                               | Automated gate                                 | Required outcome                                                                   |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Projection interrupted during update  | `collection-projection.test.ts`                | Partial temporary state is cleared and a complete replacement is required.         |
| Catalog worker exit or restart        | `collection-projection.test.ts`                | The projection becomes not ready and the renderer receives a resync request.       |
| Network loss during push and pull     | `workspace-sync-convergence.test.ts`           | Both clients keep local edits and converge after reconnection.                     |
| Expired sync credential               | `sync.test.ts` and `account-workspace.test.ts` | The API rejects it; the desktop drops only the sync session.                       |
| Durable Object restart                | `sync.test.ts`                                 | An authorized event remains available after eviction.                              |
| Backend identifier mismatch           | `workspace-storage.test.ts`                    | The worker config says `shutdown`, never `reset`.                                  |
| Invalid remote Workspace event        | `sync.test.ts`                                 | The push fails before append and a following pull remains empty.                   |
| OPFS unavailable                      | `workspace-storage.test.ts`                    | The app rejects in-memory fallback and reports an open failure.                    |
| Restore interrupted before activation | `workspace-backup.test.ts`                     | Relaunch discards the pending registry entry and keeps the prior Workspace active. |

LiveStore owns the transaction between a local commit and its persisted event
log. The renderer-crash drill below tests that browser boundary in the packaged
app. Mooligan adds no second write or recovery path around it.

## Packaged-app failure drills

Start every drill with a Workspace containing a known lot quantity and spoiler
decision. Export backup version 3 and record the active Workspace ID. After the
failure, reopen Mooligan and verify that the state is either immediately before
or immediately after the interrupted commit. An empty or partly applied
Workspace fails the release.

### Renderer termination during a commit

1. Open the Collection editor for the known lot.
2. Save a quantity change and terminate the renderer process at the same time
   from Electron's process tools.
3. Reopen the window and then restart Mooligan.
4. Verify the prior or new quantity, make another edit, and export a backup.

### Quit during Collection projection

1. Import the generated 100,000-lot scale backup.
2. Quit after restore verification starts and before the Collection route is
   ready.
3. Relaunch. The previous Workspace must still be active if activation had not
   completed. If activation completed, the restored Workspace must rebuild its
   full projection before Collection reads become ready.

### Catalog worker termination

1. Open a large Collection and terminate `catalog-query-worker` from the
   debugger.
2. Confirm Collection reads move to not ready instead of showing stale rows.
3. Trigger another Collection read. A new worker must start from a complete
   renderer snapshot.

### Network loss and credential expiry

1. Open the same Account Workspace in two profiles and stop Wrangler.
2. Edit Collection and spoiler state in both profiles.
3. Leave one connection open beyond the five-minute credential lifetime while
   its credential refresh cannot reach the API.
4. Confirm local edits continue and Settings reports paused sync.
5. Restart Wrangler, refresh the Account session, and confirm convergence.

### Durable Object and backend reset

1. Restart Wrangler without deleting its state. Both clients must reconnect and
   retain the remote event log.
2. In a disposable environment, record both local backups and replace the
   Durable Object storage so its backend identifier changes.
3. Confirm both clients stop sync and retain local Collection and spoiler state.
   They must not reconnect by clearing their own event logs.

### OPFS failure and quota exhaustion

1. Deny or disable storage for the packaged renderer origin and launch Mooligan.
   It must show the Workspace open failure instead of an empty in-memory store.
2. Re-enable storage and verify the prior Workspace returns.
3. In a disposable profile, cap the renderer origin quota below the next commit,
   attempt the commit, and restart.
4. Verify the last successful commit remains and no unsaved change is presented
   as durable.

### Restore termination before activation

1. Begin importing a large backup and terminate the renderer before activation.
2. Relaunch and confirm the prior Workspace is still active.
3. Confirm the pending restore does not appear in the Workspace picker.
4. Import again without interruption and confirm activation only after state
   verification.

## Scale command

Run the measurement on an otherwise idle release machine:

```sh
vp run desktop#measure:livestore
```

The command uses LiveStore's WebAssembly SQLite in-memory adapter so it is
repeatable outside Electron. It runs the real Mooligan event schemas,
materializers, backup code, and sync pull path. It does not replace the packaged
OPFS drills.

The catalog projection thresholds run in `collection-projection.test.ts` using
Node's SQLite on every test pass:

- Initial projection of 100,000 lots must finish below 15 seconds.
- A one-lot projection delta, including diff calculation, must finish below one
  second.

## Recorded measurement

Environment: Apple M3 Pro, 36 GiB RAM, macOS 26.5.2 (25F84), arm64,
Node.js 24.14.0. The process used Node's default heap limit and reached an
observed peak resident size of approximately 3.8 GB.

| Operation                                           |                                      Input |                         Result |
| --------------------------------------------------- | -----------------------------------------: | -----------------------------: |
| Backup restore through LiveStore events             | 100,000 lots and 100,000 spoiler decisions |    614.390 s (10 min 14.390 s) |
| Backup export, serialization, validation, and parse |                    Same materialized state |                        1.677 s |
| Serialized backup size                              |                    Same materialized state |   28,866,845 bytes (27.53 MiB) |
| Cold state snapshot open                            | 100,000 lots and 100,000 spoiler decisions |                        1.126 s |
| One-lot materialized mutation                       |                    State with 100,000 lots |                        52.5 ms |
| Initial remote pull and materialization             |                  100,000 collection events |                       41.773 s |
| Repeated quantity edits                             |                              10,000 events |                       65.072 s |
| Event-log growth                                    |                      10,000 quantity edits | 2,678,784 bytes (267.88/event) |

The configured ceiling is 100,000 Collection lots, 100,000 spoiler decisions,
and a 50 MiB backup file. The catalog projection accepts at most 100,000 lots
per complete replacement and 1,000 changed lots per delta. Initial sync has
been measured through 100,000 collection events.

Quantity edits append events and grow the log linearly. LiveStore 0.4.0 does not
provide the event-log maintenance needed to claim an unlimited history. Do not
raise these limits or claim support for histories beyond the recorded initial
pull without a new measurement. The Holding-key lookup index is required to
avoid quadratic restore and replay work. No additional index, compaction, or
snapshot service is justified by the current results.

Restoring both configured maxima is a long-running operation and approaches the
default JavaScript heap limit. Restore commits therefore wait for each 500-event
batch to reach LiveStore's leader before enqueueing the next batch. Do not
remove this backpressure or describe the maximum restore as interactive.

## Release validation record

For each release, record:

- Commit and desktop version.
- `vp install`, `vp check`, `vp run -r test`, `vp run -r build`, and
  `vp run desktop#package` results.
- The scale command output and machine details.
- Packaged offline launch, restart, OPFS, worker, and failure-drill results for
  every supported operating system.
- The two-client scenario against local Wrangler.
- The two-client scenario against the staging deployment, including offline
  edits and reconnection.

Staging and signed-installer checks require external credentials and release
infrastructure. They cannot be replaced by local automated tests.
