import * as stylex from "@stylexjs/stylex";
import { StoreRegistryProvider, useStore } from "@livestore/react";
import { Component, Suspense, use, useMemo, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../../components/button";
import { typography } from "../../styles/typography";
import { workspaceStoreOptions, workspaceStoreRegistry } from "./workspace-store";

const bootstrapPromise = window.workspace.bootstrap();

export function WorkspaceStartup({ children }: { children: ReactNode }) {
  return (
    <WorkspaceFailureBoundary>
      <Suspense fallback={<WorkspaceStatus status="loading" />}>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </Suspense>
    </WorkspaceFailureBoundary>
  );
}

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const bootstrap = use(bootstrapPromise);
  const options = useMemo(
    () => workspaceStoreOptions(bootstrap),
    [bootstrap.clientId, bootstrap.workspaceId],
  );

  return (
    <StoreRegistryProvider storeRegistry={workspaceStoreRegistry}>
      <OpenWorkspace options={options}>{children}</OpenWorkspace>
    </StoreRegistryProvider>
  );
}

function OpenWorkspace({
  children,
  options,
}: {
  children: ReactNode;
  options: ReturnType<typeof workspaceStoreOptions>;
}) {
  useStore(options);
  return children;
}

class WorkspaceFailureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("The local workspace could not be opened.", error, errorInfo);
  }

  render() {
    if (this.state.failed) {
      return <WorkspaceStatus status="failed" />;
    }
    return this.props.children;
  }
}

function WorkspaceStatus({ status }: { status: "failed" | "loading" }) {
  const failed = status === "failed";

  return (
    <div {...stylex.props(styles.screen)} role={failed ? "alert" : "status"}>
      <div {...stylex.props(styles.chrome)} data-window-drag-region />
      <div {...stylex.props(styles.content)} data-window-no-drag>
        <div {...stylex.props(styles.marker)} aria-hidden="true" />
        <p {...stylex.props(typography.label, styles.eyebrow)}>Local workspace</p>
        <h1 {...stylex.props(typography.pageTitle, styles.title)}>
          {failed ? "This workspace couldn't open" : "Opening your workspace"}
        </h1>
        <p {...stylex.props(typography.body, styles.detail)}>
          {failed
            ? "Mooligan left its local data untouched. Reload the app to try again."
            : "Reconnecting to the data stored on this device."}
        </p>
        {failed ? (
          <Button onClick={() => window.location.reload()} size="small">
            Reload Mooligan
          </Button>
        ) : null}
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
    borderBottom: "1px solid #20211e",
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
