# Run LiveStore in the Electron renderer

LiveStore runs through `@livestore/adapter-web` in Electron's renderer and
persists workspace events and materialized state in OPFS. React owns the store
lifecycle through one `StoreRegistry`, with each personal Workspace ID used as
its LiveStore `storeId`.

Electron main continues to own the card catalog, protected authentication
session, native file access, local calendar date, and device-local Workspace
registry. Catalog reads receive only the validated Workspace projection they
need. They never open LiveStore's persistence files.

We rejected the Node adapter. LiveStore documents the web adapter as its current
Electron path, while a dedicated adapter with main-process coordination does not
exist. Running a second adapter would create two persistence and coordination
models for the same Workspace.
