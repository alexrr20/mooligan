# Read collection holdings through the catalog worker

The catalog query worker attaches the active workspace database read-only and
builds collection pages in one spoiler-safe SQL query. This keeps catalog joins,
holding aggregation, filters, sorting, totals, and pagination on one side of the
renderer boundary. Collection mutations still belong to the workspace store in
the Electron main process. The worker must reopen when the active workspace or
catalog changes, and it must never write to the attached workspace.
