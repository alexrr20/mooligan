# Run LiveStore in the Electron renderer

Status: accepted

Date: 2026-08-25

LiveStore runs through `@livestore/adapter-web` in Electron's renderer and
persists workspace events and materialized state in OPFS. React owns the store
lifecycle through one `StoreRegistry`, with each personal Workspace ID used as
its LiveStore `storeId`.

The packaged renderer loads a LiveStore worker and the adapter's shared worker
from local application assets. The synchronized worker connects only to the
configured Cloudflare endpoint. All LiveStore packages are pinned to 0.4.0.

Electron main continues to own the card catalog, protected authentication
session, native file access, local calendar date, and device-local Workspace
registry. Catalog reads receive only the validated Workspace projection they
need. They never open LiveStore's persistence files.

Collection lots and spoiler decisions now use versioned LiveStore events as
their only write path. The catalog worker keeps a disposable temporary
Collection projection. Electron main keeps a fail-closed spoiler projection.
Renderer replacement, Workspace replacement, revision gaps, and catalog-worker
failure invalidate those projections and force a complete rebuild.

An optional Account supplies a short-lived Workspace-scoped sync credential.
Signing out or losing the network disables synchronization without closing the
local Workspace. A sync backend identifier mismatch shuts down the connection
without clearing local state. The API validates each pushed Workspace event
before the Durable Object appends it.

LiveStore can fall back to an in-memory database when browser persistence is
unavailable. Mooligan rejects that mode for a Workspace. The open failure screen
states that local data was left untouched. Backup version 3 restores into a new
unbound Workspace and activates it only after materialized state verification.

We rejected the Node adapter. LiveStore documents the web adapter as its current
Electron path, while a dedicated adapter with main-process coordination does not
exist. Running a second adapter would create two persistence and coordination
models for the same Workspace.
