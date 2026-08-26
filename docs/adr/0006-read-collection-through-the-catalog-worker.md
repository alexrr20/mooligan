# Read collection holdings through a temporary catalog projection

Status: superseded on 2026-08-26

The renderer now commits collection events to LiveStore. It sends a validated
snapshot followed by ordered lot changes to a temporary table in the catalog
query worker. The worker still builds each collection page in one spoiler-safe
SQL query, so catalog joins, Holding aggregation, filters, sorting, totals, and
pagination remain outside the renderer.

The temporary table is disposable. A renderer reload, workspace switch,
revision gap, or worker restart marks it unready and requires a complete
replacement. Collection reads return a typed not-ready result until replacement
finishes. The worker opens only the read-only catalog database and never opens
LiveStore persistence files.

This supersedes the earlier decision to attach the workspace SQLite database.
