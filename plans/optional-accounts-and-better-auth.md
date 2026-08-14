# Optional Accounts, Local Persistence, and Better Auth

Status: proposed

## Decision summary

Mooligan will persist user-owned data locally whether or not someone creates an
account. A Better Auth account will add online identity, synchronization, and
sharing to an existing local workspace; it will not become a prerequisite for
using the desktop app.

```text
Local SQLite workspace ── always available, no account
          │
          └── optional binding ── Better Auth user/session
                                      │
                                      └── authenticated sync API → D1
```

The local workspace remains the working copy after sign-in. Network outages,
expired sessions, and service failures may pause synchronization, but must not
prevent local reads or writes.

## Responsibilities

| Better Auth owns                    | Mooligan owns                         |
| ----------------------------------- | ------------------------------------- |
| User identity                       | Local workspace                       |
| OAuth provider accounts             | Preferences                           |
| Sessions and verification           | Collections, decks, and lists         |
| Login, logout, and provider linking | Synchronization and conflict behavior |

Better Auth's user record should contain identity and profile information such
as name, email, and avatar. Mooligan preferences and library data should live in
Mooligan-owned tables rather than Better Auth `user.additionalFields`.

Better Auth's anonymous-user plugin should not represent account-free desktop
users. It creates a server-side anonymous identity and therefore requires the
service and a network connection. A random local workspace ID is sufficient for
offline use.

## Local ownership model

On first launch, Mooligan creates a workspace with a random UUID. The workspace
does not contain personal information and is not an online guest account.

The initial local database should live under Electron's
`app.getPath("userData")` and remain separate from the replaceable Scryfall
catalog database. The main Electron process owns the database connection. The
renderer accesses it only through narrow, validated IPC methods.

Initial conceptual schema:

```text
workspace_metadata
  workspace_id       stable random UUID
  created_at

preferences
  key
  value
  updated_at
```

Preferences should be defined and validated in code. Each preference should
also declare whether it is eligible for future synchronization. Examples:

| Syncable               | Device-local                 |
| ---------------------- | ---------------------------- |
| Currency               | Window size and position     |
| Language               | Local library or backup path |
| Card-display defaults  | Downloaded catalog state     |
| Deck-building defaults | Cache size                   |

The database remains the source of truth. React Query may cache preferences for
the UI, but renderer state or `localStorage` must not be the durable store.

## Better Auth viability

Better Auth fits the current stack:

- It has a dedicated Electron integration based on system-browser sign-in,
  PKCE, custom-protocol callbacks, main-process storage, and constrained IPC.
- It supports Cloudflare D1 directly.
- Its standard request handler mounts in Hono.
- Mooligan already enables Electron sandboxing and context isolation and
  disables Node integration.

The main additional requirement is a small hosted sign-in and callback page.
The repository currently contains a desktop application and an API, but no web
frontend. Social sign-in should not be rendered inside the privileged Electron
window.

## Implementation plan

Each phase should leave a working product and be independently testable.

### Phase 1: Local workspace and preferences

1. Add a desktop workspace store backed by Node's built-in SQLite support.
2. Create a stable workspace UUID on first launch and reuse it on subsequent
   launches.
3. Add typed `readPreferences` and `updatePreferences` operations.
4. Expose only those operations through the Electron preload bridge.
5. Add a React Query hook for reading and updating preferences.
6. Replace the placeholder Settings page with one real persisted preference.
7. Use motion behavior (`system`, `reduced`, or `full`) as the first vertical
   slice because the existing global `MotionConfig` can consume it immediately.

Likely implementation locations:

```text
apps/desktop/electron/workspace/store.ts
apps/desktop/electron/workspace/preferences.ts
apps/desktop/electron/preload.ts
apps/desktop/src/electron.d.ts
apps/desktop/src/features/preferences/use-preferences.ts
apps/desktop/src/routes/settings.tsx
apps/desktop/src/routes/__root.tsx
```

Acceptance criteria:

- A fresh launch creates one workspace and the default preferences.
- Restarting the app returns the same workspace ID.
- A changed preference survives a full app restart.
- Invalid preference keys and values are rejected at the main-process boundary.
- The feature works with the API unavailable.
- Tests cover initialization, reopening, updates, and validation using a
  temporary SQLite database.

### Phase 2: Better Auth backend spike

1. Add Better Auth to the API and enable its Electron server plugin.
2. Create an auth factory from the request's Worker environment so it can use
   the existing `env.DB` D1 binding.
3. Mount `GET` and `POST` requests under `/api/auth/*` before other matching
   middleware.
4. Generate the required Better Auth SQL and commit it as the next D1 migration.
5. Configure the public base URL, a high-entropy Better Auth secret, trusted
   origins, and provider secrets through Worker configuration and secrets.
6. Begin with one social provider. Email/password should wait until password
   reset, transactional email, verification, and abuse prevention are planned.
7. Pin Better Auth package versions and add a Worker integration test covering
   session creation and authenticated session lookup.

This spike is complete when a browser client can sign in against the deployed
or local Worker and an authenticated Hono route can resolve the Better Auth
user.

### Phase 3: Hosted sign-in surface

1. Add the smallest hosted web surface capable of running Better Auth's Electron
   proxy client.
2. Preserve the PKCE and state parameters when starting provider sign-in.
3. Redirect successful authentication to Mooligan's registered custom protocol.
4. Provide the documented manual authorization-code fallback for environments
   where protocol callbacks fail.
5. Keep this surface limited to authentication until a real web product is
   required.

Before this phase, select:

- The initial identity provider.
- The production auth domain.
- The Electron bundle identifier and matching reverse-domain protocol scheme.
- How the small web bundle will be deployed alongside the Worker.

### Phase 4: Electron authentication client

1. Add `@better-auth/electron` to the desktop application.
2. Initialize the Better Auth Electron client in the main process and call its
   main-process setup before Electron becomes ready.
3. Register the safe preload bridge required by the integration.
4. Register the custom protocol in development and in the packaged application.
5. Open sign-in in the system browser and handle both deep-link and manual-code
   completion.
6. Store session material only in the main process. Use a custom Better Auth
   storage adapter backed by Electron's asynchronous `safeStorage` API.
7. Expose only sanitized user and session status to the renderer. Never expose
   cookies, bearer tokens, or the raw auth client.

Acceptance criteria:

- Sign-in completes through the system browser and returns to Mooligan.
- Relaunching restores a valid session without exposing credentials to React.
- Signing out removes the online session but preserves the local workspace.
- An expired session changes the UI to "sync paused" rather than blocking local
  data.
- Deep links work when the app is closed, open, and launched as a second
  instance.
- The manual-code fallback succeeds when deep links are unavailable.

### Phase 5: Bind an account to a workspace

After authentication works independently, add Mooligan-owned application
tables to D1:

```text
sync_workspaces
  id
  owner_user_id      Better Auth user.id
  created_at

workspace_preferences
  workspace_id
  key
  value
  updated_at
```

Add an authenticated endpoint that receives the local workspace ID and returns
the user's remote sync workspace. Store that remote ID in local workspace
metadata.

Binding rules:

- If the account has no remote workspace, create one and upload eligible local
  preferences.
- If the account already has cloud data, merge it with the local workspace
  rather than overwriting either side silently.
- Never attach a workspace already bound to one Better Auth user to another
  user automatically.
- Signing out stops synchronization but retains local data.
- Removing local data is a separate, explicit destructive action.
- Signing into another account selects or creates a different local workspace
  so that user data is not mixed.

### Phase 6: Preference synchronization

1. Synchronize only preferences explicitly marked as syncable.
2. Treat each preference key as an independent value.
3. Use simple last-write-wins conflict handling per preference key, with the
   server assigning the authoritative write version or timestamp.
4. Apply remote changes to SQLite first, then notify the renderer through the
   normal local preference path.
5. Display sync state separately from save state: local changes are saved as
   soon as SQLite commits, even when cloud synchronization is pending.

This simple conflict policy is appropriate for preferences. Collections,
decks, and lists need their own synchronization design and should not inherit a
generic preference-sync mechanism.

### Phase 7: Backups and user-owned library data

Before users can accumulate substantial collection or deck data:

1. Add explicit export and import of the local workspace.
2. Validate backups before replacing or merging local data.
3. Store collections, decks, and lists in the same durable workspace database,
   using stable IDs from the existing domain models.
4. Keep every mutation local-first and layer authenticated synchronization on
   top only after the feature works completely offline.

Without an account, backup export is the recovery mechanism if the device or
local app data is lost. The UI should communicate that limitation clearly.

## Security requirements

- Keep tokens and cookies out of the renderer process and its storage APIs.
- Validate all custom IPC arguments and validate the sender where applicable.
- Keep `nodeIntegration: false`, `contextIsolation: true`, and sandboxing
  enabled.
- Allow only the exact production auth origin and custom protocol.
- Use HTTPS for every production auth request.
- Store Better Auth and provider secrets as Worker secrets, never in the repo.
- UUID v7 should be used for the users' ID.
- Protect locally persisted session material with asynchronous Electron
  `safeStorage`; detect and report platforms where protected storage is
  unavailable.
- Treat account deletion, local-data removal, and remote-data deletion as three
  distinct operations with explicit confirmation.

## Validation strategy

For every phase:

```sh
vp check
vp test
```

Also run any relevant workspace build or integration task. The authentication
phases require end-to-end tests against local Wrangler/D1 plus packaged-app
smoke tests for protocol registration; unit tests alone cannot verify the
system-browser callback.

Critical scenarios:

1. Use Mooligan indefinitely without an account or network.
2. Create local data, sign in for the first time, and upload it.
3. Sign into an existing account on a second device and download its workspace.
4. Edit on two devices and resolve a preference conflict deterministically.
5. Lose connectivity while editing and synchronize after reconnecting.
6. Let a session expire while offline without losing local access.
7. Sign out without deleting local data.
8. Attempt to switch accounts without mixing their workspaces.

## References

- [Better Auth Electron integration](https://better-auth.com/docs/integrations/electron)
- [Better Auth Hono integration](https://better-auth.com/docs/integrations/hono)
- [Better Auth Cloudflare D1 support](https://better-auth.com/blog/1-5)
- [Better Auth database concepts](https://better-auth.com/docs/concepts/database)
- [Better Auth anonymous plugin](https://better-auth.com/docs/beta/plugins/anonymous)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
