# Use LiveStore for mobile Workspace sync

Status: accepted

Date: 2026-08-28

The mobile app joins the existing Workspace event log with LiveStore's Expo
adapter and the shared Workspace schema. It does not introduce a separate REST
write model. While LiveStore 0.4.0 cannot bind changeset blobs on Expo SDK 57,
Mooligan carries a narrow pinned dependency patch covered by a persistence test
and removes it when an upstream release contains the fix. This keeps desktop
and mobile on one conflict model without downgrading Expo or waiting to prove
mobile synchronization.
