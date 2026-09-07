# Mooligan mobile

The iOS and Android client is an Expo development-build project. It creates a persistent local
Workspace, optionally signs in through the same hosted Google flow as desktop,
and synchronizes the shared LiveStore event log. Home shows the local Collection
and Deck counts. Mobile card browsing and editing are still to come.

From the repository root:

```bash
vp install
vp run mobile#ios
vp run mobile#android
```

Android native builds require JDK 17. On Apple silicon with Homebrew, run the
Android command with the installed JDK if Java is not already configured:

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
  vp run mobile#android
```

After installing a development build, start Metro without rebuilding native
code:

```bash
vp run mobile#dev
```

Expo generates `ios/` and `android/` from `app.json`; both directories stay out
of version control.

## Account and sync setup

For local development with the same API as desktop, set the public authentication
origin before starting Metro:

```bash
EXPO_PUBLIC_MOOLIGAN_AUTH_ORIGIN=http://127.0.0.1:3000 \
  vp run mobile#dev
```

For a release build or a physical Device, set the variable to your deployed
HTTPS API origin before exporting the app. The sync URL is derived from that
origin as `/api/sync`, using WSS for HTTPS.
Without this variable, the local Workspace works and sign-in is unavailable.
The origin must be HTTPS, or HTTP on loopback for local development. For the iOS
simulator, `http://127.0.0.1:3000` reaches the local API. On Android, forward that
port with `adb reverse tcp:3000 tcp:3000`. A physical Device needs an HTTPS origin
it can reach. Configure the API's Google callback and trusted origin for that
same service, as described in the root README.

Rebuild the development client after this change. It adds Crypto, SecureStore,
SQLite, Network, and WebBrowser native modules. The URL scheme is `com.mooligan.app`.
Mobile uses Better Auth's Expo client for Google sign-in, browser callbacks,
session caching, and cookies in SecureStore. The storage prefix is scoped to the
Device installation and service origin. Account credentials never go into
AsyncStorage or the Workspace event log.

`@mooligan/account` shares Workspace registry, binding, and credential renewal
rules. Electron retains its own auth client. The API enables both Better Auth's
Electron and Expo plugins.

The Workspace registry and LiveStore event log use separate SQLite databases.
Signing in either binds the active unbound Workspace or opens the Account's
existing Workspace while retaining the local one. Settings can reopen retained
Workspaces. Signing out keeps the active Workspace available locally and stops
sync. The Expo plugin clears the local session even when remote sign-out fails.
Electron continues to retain its session for a retry in that case.
Short-lived sync credentials stay in memory and renew before expiry. Foreground
resume and service retries restore sync after interruptions. Client upgrade
requirements pause sync without deleting local data.

## Verification

```bash
vp run mobile#test
vp run mobile#build
```

On a development build:

1. Open Home without an Account and verify the local Collection and Deck counts.
2. Sign in through Settings using the same Account as desktop.
3. Add a card to the Collection or create a Deck on desktop. Verify its count
   appears on mobile, then reopen mobile offline and verify it remains.
4. Sign out and verify the Workspace stays open with sync disabled.
5. Sign in again, then background and resume the app after five minutes to check
   credential renewal. Retained local Workspaces remain available in Settings.

The native storage integration follows the [LiveStore Expo adapter](https://docs.livestore.dev/api/adapter-expo/type-aliases/makedboptions/).
Browser sign-in uses [Better Auth’s Expo integration](https://better-auth.com/docs/integrations/expo).
