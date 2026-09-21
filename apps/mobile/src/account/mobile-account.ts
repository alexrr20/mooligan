import type { MobileAuthClient } from "./auth-client";
import type { WorkspaceRegistry } from "@mooligan/account/registry";
import type { AuthSnapshot, WorkspaceRuntime } from "@mooligan/account/runtime";
import { AccountWorkspace } from "@mooligan/account/workspace";

export interface LocalWorkspace {
  close(): Promise<void>;
  observeConnection(changed: (connected: boolean) => void): () => void;
}

export type MobileAccountSnapshot<Workspace extends LocalWorkspace> = {
  auth: AuthSnapshot;
  busy: boolean;
  configured: boolean;
  connected: boolean;
  error: string | null;
  runtime: WorkspaceRuntime;
  workspace: Workspace | null;
};

export class MobileAccount<Workspace extends LocalWorkspace> {
  #auth: MobileAuthClient | null = null;
  readonly #createAuth: (() => MobileAuthClient) | null;
  readonly #account: AccountWorkspace;
  readonly #registry: WorkspaceRegistry;
  readonly #open: (runtime: WorkspaceRuntime) => Promise<Workspace>;
  readonly #listeners = new Set<() => void>();
  #snapshot: MobileAccountSnapshot<Workspace>;
  #operations = Promise.resolve();
  #initialized: Promise<void> | undefined;
  #stopConnection: (() => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #active = true;
  #selectedAccountId: string | null = null;

  constructor(
    createAuth: (() => MobileAuthClient) | null,
    registry: WorkspaceRegistry,
    open: (runtime: WorkspaceRuntime) => Promise<Workspace>,
    appVersion: string,
    authOrigin: string | null,
    request: typeof fetch = globalThis.fetch,
  ) {
    this.#registry = registry;
    this.#createAuth = createAuth;
    this.#open = open;
    const signedOut: AuthSnapshot = { status: "signed-out", user: null, pendingAuth: false };
    this.#account = new AccountWorkspace(
      {
        snapshot: () => this.#snapshot.auth,
        requestAccountWorkspace: async (path, init) => {
          if (!this.#auth || !authOrigin) throw new Error("Account sign-in is not configured.");
          const headers = new Headers(init.headers);
          headers.set("cookie", this.#auth.getCookie());
          return request(new URL(path, authOrigin), {
            ...init,
            headers,
            credentials: "omit",
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
        },
      },
      registry,
      async () => {
        await this.#applyRuntime();
      },
      Date.now,
      appVersion,
    );
    this.#snapshot = {
      auth: signedOut,
      busy: false,
      configured: createAuth !== null,
      connected: false,
      error: null,
      runtime: this.#account.runtime(),
      workspace: null,
    };
  }

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  initialize() {
    return (this.#initialized ??= this.#run(async () => {
      // Open local data before touching protected storage or making a network request.
      await this.#applyRuntime();
      await this.#refresh();
    }));
  }

  signIn() {
    return this.#run(async () => {
      if (!this.#auth) return;
      this.#set({ busy: true, error: null, auth: { ...this.#snapshot.auth, pendingAuth: true } });
      try {
        const { error } = await this.#auth.signIn.social({
          provider: "google",
          callbackURL: "com.mooligan.app://settings",
        });
        if (error) throw new Error(error.message ?? "Sign-in failed.");
        this.#selectedAccountId = null;
        await this.#refresh();
      } finally {
        this.#set({ auth: { ...this.#snapshot.auth, pendingAuth: false } });
      }
    });
  }

  signOut() {
    return this.#run(async () => {
      if (!this.#auth) return;
      this.#set({ busy: true, error: null });
      try {
        const { error } = await this.#auth.signOut();
        if (error) throw new Error(error.message ?? "Remote sign-out failed.");
      } finally {
        // The Expo plugin clears the local session even if the service is offline.
        const auth: AuthSnapshot = { status: "signed-out", user: null, pendingAuth: false };
        this.#set({ auth });
        await this.#account.authChanged(auth);
      }
    });
  }

  refresh() {
    return this.#run(async () => {
      this.#set({ busy: true, error: null });
      await this.#refresh();
    });
  }

  selectWorkspace(workspaceId: string) {
    return this.#run(async () => {
      this.#set({ busy: true, error: null });
      await this.#account.selectWorkspace(workspaceId);
      this.#selectedAccountId = this.#snapshot.auth.user?.id ?? null;
    });
  }

  restoreWorkspace(restore: (workspace: Workspace) => Promise<void>) {
    return this.#run(async () => {
      this.#set({ busy: true, error: null });
      const pending = this.#registry.beginRestore();
      const runtime: WorkspaceRuntime = {
        ...pending,
        sync: null,
        syncIssue: null,
        workspaces: this.#registry.workspaces(),
      };
      let restored: Workspace | undefined;
      try {
        restored = await this.#open(runtime);
        await restore(restored);
        this.#registry.activateRestore(pending.workspaceId);
      } catch (error) {
        try {
          await restored?.close();
        } finally {
          this.#registry.cancelRestore(pending.workspaceId);
        }
        throw error;
      }

      // Adopt the verified store so activation cannot fail while reopening SQLite.
      const previous = this.#snapshot.workspace;
      this.#setWorkspace({ ...runtime, workspaces: this.#registry.workspaces() }, restored);
      this.#selectedAccountId = this.#snapshot.auth.user?.id ?? null;
      try {
        await this.#account.workspaceActivated();
      } finally {
        await previous?.close();
      }
    });
  }

  setActive(active: boolean) {
    this.#active = active;
    clearTimeout(this.#timer);
    if (active) void this.refresh();
  }

  reportError(message: string) {
    this.#set({ error: message, busy: false });
  }

  async #refresh() {
    if (!this.#auth) {
      if (!this.#createAuth) {
        await this.#applyRuntime();
        return;
      }
      this.#auth = this.#createAuth();
      const cached = this.#auth.$store.atoms.session.get().data;
      if (cached) {
        const auth: AuthSnapshot = {
          status: "session-unavailable",
          pendingAuth: false,
          user: { ...cached.user, image: cached.user.image ?? null },
        };
        this.#set({ auth });
        await this.#account.authChanged(auth);
      }
    }
    let auth: AuthSnapshot;
    try {
      const { data, error } = await this.#auth.getSession({ query: { disableCookieCache: true } });
      if (error && error.status !== 401 && error.status !== 403) {
        throw new Error(error.message ?? "The Account session is unavailable.");
      }
      auth = {
        pendingAuth: false,
        status: data ? "signed-in" : "signed-out",
        user: data ? { ...data.user, image: data.user.image ?? null } : null,
      };
    } catch {
      auth = { ...this.#snapshot.auth, status: "session-unavailable", pendingAuth: false };
    }
    this.#set({ auth });
    const runtime = this.#account.runtime();
    // Refresh only the credential when already attached. Retrying a failed bind
    // must go through the Account connection flow again.
    if (
      auth.status === "signed-in" &&
      (runtime.sync || (auth.user !== null && auth.user.id === this.#selectedAccountId))
    ) {
      await this.#account.refreshSync();
    } else {
      await this.#account.authChanged(auth);
    }
  }

  async #applyRuntime() {
    const runtime = this.#account.runtime();
    const current = this.#snapshot;
    const needsOpen =
      !current.workspace ||
      current.runtime.workspaceId !== runtime.workspaceId ||
      current.runtime.sync?.credential !== runtime.sync?.credential;
    if (!needsOpen) {
      this.#set({ runtime });
      return;
    }
    this.#stopConnection?.();
    this.#stopConnection = undefined;
    this.#set({ workspace: null, connected: false });
    await current.workspace?.close();
    const workspace = await this.#open(runtime);
    this.#setWorkspace(runtime, workspace);
  }

  #setWorkspace(runtime: WorkspaceRuntime, workspace: Workspace) {
    this.#stopConnection?.();
    this.#set({ runtime, workspace, connected: false });
    this.#stopConnection = workspace.observeConnection((connected) => this.#set({ connected }));
  }

  #scheduleRefresh() {
    clearTimeout(this.#timer);
    if (!this.#active || !this.#auth || this.#snapshot.auth.pendingAuth) return;
    const { auth, runtime } = this.#snapshot;
    if (auth.status === "signed-out" || auth.status === "protected-storage-unavailable") return;
    const delay = runtime.sync
      ? Math.max(1_000, runtime.sync.expiresAt * 1_000 - Date.now() - 60_000)
      : 30_000;
    this.#timer = setTimeout(() => {
      void this.refresh();
    }, delay);
  }

  #set(update: Partial<MobileAccountSnapshot<Workspace>>) {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) listener();
  }

  #run(operation: () => Promise<void>) {
    const result = this.#operations
      .then(operation)
      .catch((error: Error) => {
        this.#set({ error: error.message || "The Account could not be updated." });
      })
      .finally(() => {
        this.#set({ busy: false });
        this.#scheduleRefresh();
      });
    this.#operations = result;
    return result;
  }
}
