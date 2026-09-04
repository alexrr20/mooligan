import * as stylex from "@stylexjs/stylex";
import { StoreRegistryProvider, useStore } from "@livestore/react";
import { Effect, Fiber, Stream } from "effect";
import {
  Component,
  Suspense,
  use,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import type { WorkspaceRuntime } from "../../../shared/desktop-api";
import { Button } from "../../components/ui/button";
import { SolidCardLoadingIndicator } from "../../components/solid-card-loading-indicator";
import { typography } from "../../styles/typography";
import { CollectionProjectionStartup } from "./collection-projection";
import { SpoilerProjectionStartup } from "./spoiler-projection";
import { createLiveStoreRegistry, workspaceStoreOptions } from "./workspace-store";
import { WorkspaceLiveStoreProvider, type WorkspaceLiveStore } from "./workspace-store-context";
import { requirePersistentWorkspaceStorage } from "./workspace-storage";
import {
  WorkspaceRuntimeProvider,
  type WorkspaceConnectionStatus,
} from "./workspace-runtime-context";

const initialRuntimePromise = window.workspace.runtime();
const CREDENTIAL_REFRESH_LEAD_MS = 60_000;
const SYNC_CONNECTING_GRACE_MS = 15_000;

type OpenSession = {
  registry: ReturnType<typeof createLiveStoreRegistry>;
  runtime: WorkspaceRuntime;
  state: "open";
};

type ClosingSession = {
  current: OpenSession;
  next: WorkspaceRuntime;
  state: "closing";
};

type WorkspaceSession = ClosingSession | OpenSession;

export function WorkspaceStartup({ children }: { children: ReactNode }) {
  return (
    <WorkspaceFailureBoundary>
      <Suspense fallback={<WorkspaceLoadingScreen />}>
        <WorkspaceRuntimeRoot>{children}</WorkspaceRuntimeRoot>
      </Suspense>
    </WorkspaceFailureBoundary>
  );
}

function WorkspaceRuntimeRoot({ children }: { children: ReactNode }) {
  const initialRuntime = use(initialRuntimePromise);
  const [session, setSession] = useState<WorkspaceSession>(() => ({
    registry: createLiveStoreRegistry(),
    runtime: initialRuntime,
    state: "open",
  }));

  useEffect(() => {
    let active = true;
    let queue = Promise.resolve();

    const readLatestRuntime = (read: () => Promise<WorkspaceRuntime>) => {
      queue = queue
        .then(read)
        .then((next) => {
          if (!active) return;
          setSession((current) => startClosingSession(current, next));
        })
        .catch(() => {
          console.error("The Workspace runtime could not be refreshed.");
        });
    };

    const stopChanged = window.workspace.onChanged(() => {
      readLatestRuntime(() => window.workspace.runtime());
    });
    readLatestRuntime(() => window.workspace.runtime());
    const runtime = session.state === "open" ? session.runtime : session.next;
    const refreshDelay = runtime.sync
      ? Math.max(1_000, runtime.sync.expiresAt * 1_000 - Date.now() - CREDENTIAL_REFRESH_LEAD_MS)
      : undefined;
    const refreshTimer =
      refreshDelay === undefined
        ? undefined
        : window.setTimeout(() => {
            readLatestRuntime(() => window.workspace.refreshSync());
          }, refreshDelay);

    return () => {
      active = false;
      stopChanged();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, [session]);

  if (session.state === "closing") {
    return <CloseWorkspaceSession session={session} onClosed={(next) => setSession(next)} />;
  }

  const options = workspaceStoreOptions(session.runtime);
  return (
    <StoreRegistryProvider storeRegistry={session.registry}>
      <Suspense fallback={<WorkspaceLoadingScreen />}>
        <OpenWorkspace options={options} runtime={session.runtime}>
          {children}
        </OpenWorkspace>
      </Suspense>
    </StoreRegistryProvider>
  );
}

function CloseWorkspaceSession({
  onClosed,
  session,
}: {
  onClosed: (session: OpenSession) => void;
  session: ClosingSession;
}) {
  useEffect(() => {
    let active = true;
    void session.current.registry.dispose().then(() => {
      if (active) {
        onClosed({
          registry: createLiveStoreRegistry(),
          runtime: session.next,
          state: "open",
        });
      }
    });
    return () => {
      active = false;
    };
  }, [onClosed, session]);

  return <WorkspaceLoadingScreen />;
}

function OpenWorkspace({
  children,
  options,
  runtime,
}: {
  children: ReactNode;
  options: ReturnType<typeof workspaceStoreOptions>;
  runtime: WorkspaceRuntime;
}) {
  const store = useStore(options);
  requirePersistentWorkspaceStorage(store.storageMode);
  const connectionStatus = useConnectionStatus(store, runtime);

  useEffect(() => {
    const dispose = () => {
      void store.shutdownPromise();
    };
    window.addEventListener("beforeunload", dispose, { once: true });
    return () => window.removeEventListener("beforeunload", dispose);
  }, [store]);

  return (
    <WorkspaceLiveStoreProvider store={store}>
      <WorkspaceRuntimeProvider connectionStatus={connectionStatus} runtime={runtime}>
        <CollectionProjectionStartup
          loading={<WorkspaceLoadingScreen />}
          workspaceId={options.storeId}
        >
          <SpoilerProjectionStartup
            loading={<WorkspaceLoadingScreen />}
            workspaceId={options.storeId}
          >
            {children}
          </SpoilerProjectionStartup>
        </CollectionProjectionStartup>
      </WorkspaceRuntimeProvider>
    </WorkspaceLiveStoreProvider>
  );
}

function useConnectionStatus(store: WorkspaceLiveStore, runtime: WorkspaceRuntime) {
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!runtime.sync) return;

    let active = true;
    let pauseTimer: number | undefined;
    const markConnecting = () => {
      pauseTimer ??= window.setTimeout(() => {
        if (active) setStalled(true);
      }, SYNC_CONNECTING_GRACE_MS);
    };
    const update = (status: { isConnected: boolean }) => {
      if (!active) return;
      setConnected(status.isConnected);
      if (status.isConnected) {
        if (pauseTimer !== undefined) window.clearTimeout(pauseTimer);
        pauseTimer = undefined;
        setStalled(false);
      } else {
        markConnecting();
      }
    };
    markConnecting();
    void store.networkStatus.pipe(Effect.runPromise).then(update);
    const fiber = store.networkStatus.changes.pipe(
      Stream.runForEach((status) => Effect.sync(() => update(status))),
      Effect.runFork,
    );
    const connectedToBrowser = () => setOnline(true);
    const disconnectedFromBrowser = () => setOnline(false);
    window.addEventListener("online", connectedToBrowser);
    window.addEventListener("offline", disconnectedFromBrowser);

    return () => {
      active = false;
      window.removeEventListener("online", connectedToBrowser);
      window.removeEventListener("offline", disconnectedFromBrowser);
      if (pauseTimer !== undefined) window.clearTimeout(pauseTimer);
      Fiber.interrupt(fiber).pipe(Effect.runFork);
    };
  }, [runtime.sync, store]);

  return connectionStatus(runtime, connected, online, stalled);
}

function connectionStatus(
  runtime: WorkspaceRuntime,
  connected: boolean,
  online: boolean,
  stalled: boolean,
): WorkspaceConnectionStatus {
  if (runtime.syncIssue) return "sync-paused";
  if (!runtime.sync) return "local";
  if (!online || stalled) return "sync-paused";
  return connected ? "synchronized" : "connecting";
}

function startClosingSession(current: WorkspaceSession, next: WorkspaceRuntime): WorkspaceSession {
  if (current.state === "closing") {
    return sameRuntime(current.next, next) ? current : { ...current, next };
  }
  return sameRuntime(current.runtime, next) ? current : { current, next, state: "closing" };
}

function sameRuntime(left: WorkspaceRuntime, right: WorkspaceRuntime) {
  return (
    left.workspaceId === right.workspaceId &&
    left.sync?.credential === right.sync?.credential &&
    left.syncIssue === right.syncIssue &&
    JSON.stringify(left.workspaces) === JSON.stringify(right.workspaces)
  );
}

class WorkspaceFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    console.error("The local Workspace could not be opened.");
  }

  render() {
    if (this.state.failed) {
      return <WorkspaceFailureScreen />;
    }
    return this.props.children;
  }
}

function WorkspaceLoadingScreen() {
  return (
    <div {...stylex.props(styles.screen)}>
      <div {...stylex.props(styles.chrome)} data-window-drag-region />
      <div {...stylex.props(styles.loadingContent)} data-window-no-drag>
        <SolidCardLoadingIndicator startOffsetMs={600} />
      </div>
    </div>
  );
}

function WorkspaceFailureScreen() {
  return (
    <div {...stylex.props(styles.screen)} role="alert">
      <div {...stylex.props(styles.chrome)} data-window-drag-region />
      <div {...stylex.props(styles.content)} data-window-no-drag>
        <div {...stylex.props(styles.marker)} aria-hidden="true" />
        <p {...stylex.props(typography.label, styles.eyebrow)}>Local Workspace</p>
        <h1 {...stylex.props(typography.pageTitle, styles.title)}>This Workspace couldn't open</h1>
        <p {...stylex.props(typography.body, styles.detail)}>
          Mooligan left its local data untouched. Reload the app to try again.
        </p>
        <Button onClick={() => window.location.reload()} size="sm">
          Reload Mooligan
        </Button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  screen: {
    minHeight: "100%",
    display: "grid",
    gridTemplateRows: "52px minmax(0, 1fr)",
    backgroundColor: "#0a0a0a",
  },
  chrome: {
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#20211e",
  },
  loadingContent: {
    minHeight: 0,
    display: "grid",
    placeItems: "center",
    paddingBottom: "52px",
  },
  content: {
    width: "min(420px, calc(100vw - 64px))",
    margin: "auto",
    paddingBottom: "52px",
  },
  marker: {
    width: "38px",
    height: "3px",
    marginBottom: "26px",
    borderRadius: "999px",
    backgroundColor: "#11c565",
    boxShadow: "0 0 18px rgba(17, 197, 101, 0.32)",
  },
  eyebrow: {
    margin: "0 0 12px",
    color: "#73766d",
  },
  title: {
    maxWidth: "360px",
    margin: "0",
    color: "#f4f1e8",
  },
  detail: {
    maxWidth: "360px",
    margin: "14px 0 26px",
    color: "#9b9d94",
  },
});
