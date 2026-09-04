import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";

import type { WorkspaceSyncIssue } from "../../../shared/desktop-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { typography } from "../../styles/typography";
import { useWorkspaceRuntime } from "./workspace-runtime-context";

export function WorkspaceSetting() {
  const { connectionStatus, runtime } = useWorkspaceRuntime();
  const selectWorkspace = useMutation({
    mutationFn: (workspaceId: string) => window.workspace.select(workspaceId),
  });
  const items = runtime.workspaces.map((workspace) => ({
    label: workspace.label,
    value: workspace.workspaceId,
  }));
  const active = runtime.workspaces.find(({ active }) => active);

  return (
    <section {...stylex.props(styles.section)} aria-labelledby="workspace-heading">
      <div {...stylex.props(styles.intro)}>
        <h2 {...stylex.props(typography.pageTitle, styles.title)} id="workspace-heading">
          Workspaces
        </h2>
        <p {...stylex.props(typography.body, styles.copy)}>
          Each Workspace keeps its own Collection and spoiler choices. Switching never merges or
          deletes another Workspace.
        </p>
      </div>

      <div {...stylex.props(styles.controlRow)}>
        <div {...stylex.props(typography.label, styles.index)} aria-hidden="true">
          {String(runtime.workspaces.findIndex(({ active }) => active) + 1).padStart(2, "0")}
        </div>
        <div {...stylex.props(styles.controlBody)}>
          <Select
            disabled={selectWorkspace.isPending}
            items={items}
            onValueChange={(workspaceId) => {
              if (workspaceId && workspaceId !== runtime.workspaceId) {
                selectWorkspace.mutate(workspaceId);
              }
            }}
            value={runtime.workspaceId}
          >
            <span {...stylex.props(typography.label, styles.label)} id="active-workspace-label">
              Active Workspace
            </span>
            <SelectTrigger aria-labelledby="active-workspace-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {runtime.workspaces.map((workspace, index) => (
                <SelectItem
                  key={workspace.workspaceId}
                  label={workspace.label}
                  value={workspace.workspaceId}
                >
                  <span {...stylex.props(typography.label, styles.itemIndex)}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span {...stylex.props(styles.itemText)}>
                    <span {...stylex.props(typography.body)}>{workspace.label}</span>
                    <small {...stylex.props(typography.bodySmall, styles.association)}>
                      {workspace.accountAssociation === "account"
                        ? "Account associated"
                        : "Unbound / local only"}
                    </small>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span {...stylex.props(typography.bodySmall, styles.activeDetail)}>
            {active?.accountAssociation === "account"
              ? "Associated with an Account"
              : "Unbound and stored on this device"}
          </span>
        </div>
        <span {...stylex.props(typography.label, styles.badge)}>
          {connectionLabel(connectionStatus)}
        </span>
      </div>

      {(selectWorkspace.error || runtime.syncIssue) && (
        <p {...stylex.props(typography.bodySmall, styles.error)} role="alert">
          {selectWorkspace.error instanceof Error
            ? selectWorkspace.error.message
            : syncIssueMessage(runtime.syncIssue)}
        </p>
      )}
    </section>
  );
}

function connectionLabel(status: ReturnType<typeof useWorkspaceRuntime>["connectionStatus"]) {
  if (status === "synchronized") return "Synchronized";
  if (status === "connecting") return "Connecting";
  if (status === "sync-paused") return "Sync paused";
  return "Local only";
}

function syncIssueMessage(issue: WorkspaceSyncIssue | null) {
  if (issue === "client-upgrade-required") {
    return "Update Mooligan before resuming sync. Local edits are still saved on this device.";
  }
  if (issue === "session-unavailable") {
    return "Sync is paused until the Account session reconnects. Local edits still work.";
  }
  if (issue === "workspace-unavailable") {
    return "The Account Workspace could not be opened. Mooligan kept the current local data.";
  }
  return "Sync cannot reach the Account service. Local edits are still saved on this device.";
}

const styles = stylex.create({
  section: {
    maxWidth: "980px",
    marginBottom: "64px",
  },
  intro: {
    paddingBlock: "26px 30px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(220px, 0.75fr) minmax(300px, 1fr)",
      "@media (max-width: 820px)": "1fr",
    },
    gap: {
      default: "56px",
      "@media (max-width: 820px)": "18px",
    },
    alignItems: "end",
  },
  title: {
    margin: 0,
    color: "#f4f1e8",
  },
  copy: {
    maxWidth: "520px",
    margin: 0,
    color: "#a6a89d",
  },
  controlRow: {
    minHeight: "126px",
    padding: "20px 22px",
    display: "grid",
    gridTemplateColumns: {
      default: "48px minmax(260px, 1fr) auto",
      "@media (max-width: 700px)": "40px minmax(0, 1fr)",
    },
    alignItems: "center",
    gap: "18px",
  },
  index: {
    alignSelf: "stretch",
    display: "grid",
    placeItems: "center",
    color: "#65685f",
  },
  controlBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "8px",
  },
  label: {
    display: "block",
    marginBottom: "7px",
    color: "#85887e",
  },
  activeDetail: {
    color: "#777a70",
  },
  badge: {
    padding: "5px 8px",
    color: "#a6a89d",
    borderRadius: "999px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    "@media (max-width: 700px)": {
      display: "none",
    },
  },
  itemIndex: {
    color: "#6f7269",
  },
  itemText: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  association: {
    color: "#777a70",
  },
  error: {
    margin: 0,
    padding: "11px 22px",
    color: "#ef9a8f",
    backgroundColor: "rgba(170, 45, 34, 0.1)",
  },
});
