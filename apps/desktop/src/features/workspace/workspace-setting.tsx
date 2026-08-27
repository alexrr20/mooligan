import { Select } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";

import type { WorkspaceSyncIssue } from "../../../shared/desktop-api";
import { colors } from "../../styles/tokens.stylex.js";
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
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Data / Workspace</p>
          <h2 {...stylex.props(typography.pageTitle, styles.title)} id="workspace-heading">
            Choose your Workspace.
          </h2>
        </div>
        <p {...stylex.props(typography.body, styles.copy)}>
          Each Workspace keeps its own Collection and spoiler choices. Switching never merges or
          deletes another Workspace.
        </p>
      </div>

      <div {...stylex.props(styles.controlRow)}>
        <div {...stylex.props(styles.index)} aria-hidden="true">
          {String(runtime.workspaces.findIndex(({ active }) => active) + 1).padStart(2, "0")}
        </div>
        <div {...stylex.props(styles.controlBody)}>
          <Select.Root
            disabled={selectWorkspace.isPending}
            items={items}
            onValueChange={(workspaceId) => {
              if (workspaceId && workspaceId !== runtime.workspaceId) {
                selectWorkspace.mutate(workspaceId);
              }
            }}
            value={runtime.workspaceId}
          >
            <Select.Label {...stylex.props(typography.label, styles.label)}>
              Active Workspace
            </Select.Label>
            <Select.Trigger {...stylex.props(typography.control, styles.trigger)}>
              <Select.Value />
              <Select.Icon {...stylex.props(styles.chevron)} aria-hidden="true">
                ▾
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner
                {...stylex.props(styles.positioner)}
                alignItemWithTrigger={false}
                sideOffset={6}
              >
                <Select.Popup {...stylex.props(styles.popup)}>
                  <Select.List {...stylex.props(styles.list)}>
                    {runtime.workspaces.map((workspace, index) => (
                      <Select.Item
                        {...stylex.props(typography.body, styles.item)}
                        key={workspace.workspaceId}
                        label={workspace.label}
                        value={workspace.workspaceId}
                      >
                        <span {...stylex.props(typography.label, styles.itemIndex)}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <Select.ItemText {...stylex.props(styles.itemText)}>
                          <span>{workspace.label}</span>
                          <small {...stylex.props(typography.bodySmall, styles.association)}>
                            {workspace.accountAssociation === "account"
                              ? "Account associated"
                              : "Unbound / local only"}
                          </small>
                        </Select.ItemText>
                        <Select.ItemIndicator {...stylex.props(styles.indicator)}>
                          ●
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
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

      <div {...stylex.props(styles.statusRow)}>
        <span
          {...stylex.props(
            styles.statusDot,
            connectionStatus === "connecting" && styles.connectingDot,
            connectionStatus === "sync-paused" && styles.pausedDot,
          )}
          aria-hidden="true"
        />
        <p {...stylex.props(typography.label, styles.status)} aria-live="polite">
          {selectWorkspace.isPending
            ? "Switching Workspace"
            : connectionDescription(connectionStatus)}
        </p>
      </div>
    </section>
  );
}

function connectionLabel(status: ReturnType<typeof useWorkspaceRuntime>["connectionStatus"]) {
  if (status === "synchronized") return "Synchronized";
  if (status === "connecting") return "Connecting";
  if (status === "sync-paused") return "Sync paused";
  return "Local only";
}

function connectionDescription(status: ReturnType<typeof useWorkspaceRuntime>["connectionStatus"]) {
  if (status === "synchronized") return "Local access ready / changes synchronized";
  if (status === "connecting") return "Local access ready / connecting to sync";
  if (status === "sync-paused") return "Local access ready / sync paused";
  return "Local access ready / saved on this device";
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
  kicker: {
    margin: "0 0 12px",
    color: "#85887e",
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
    backgroundColor: "#171914",
  },
  index: {
    alignSelf: "stretch",
    display: "grid",
    placeItems: "center",
    color: "#65685f",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    letterSpacing: "0.08em",
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
  trigger: {
    width: "min(100%, 420px)",
    minHeight: "42px",
    paddingInline: "13px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    color: "#f4f1e8",
    backgroundColor: "#0f100d",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#3b3e36",
    borderRadius: "10px",
    cursor: "pointer",
    textAlign: "left",
    transition: "border-color 140ms ease, background-color 140ms ease",
    ":hover": {
      borderColor: "#85887e",
      backgroundColor: "#121410",
    },
    ":focus-visible": {
      outline: `2px solid ${colors.accent}`,
      outlineOffset: "2px",
    },
    ":disabled": {
      cursor: "wait",
      opacity: 0.55,
    },
  },
  chevron: {
    color: colors.accent,
    fontSize: "13px",
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
  positioner: {
    zIndex: 100,
    outline: "none",
  },
  popup: {
    minWidth: "var(--anchor-width)",
    color: "#f4f1e8",
    backgroundColor: "#151713",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#45483f",
    borderRadius: "10px",
    boxShadow: "0 18px 48px rgba(0, 0, 0, 0.46)",
    transformOrigin: "var(--transform-origin)",
  },
  list: {
    maxHeight: "min(320px, var(--available-height))",
    padding: "5px",
    overflowY: "auto",
  },
  item: {
    minHeight: "58px",
    padding: "9px 10px",
    display: "grid",
    gridTemplateColumns: "30px minmax(0, 1fr) 16px",
    alignItems: "center",
    gap: "9px",
    borderRadius: "7px",
    cursor: "default",
    outline: "none",
    transition: "background-color 100ms ease",
    "[data-highlighted]": {
      backgroundColor: "#24271f",
    },
  },
  itemIndex: {
    color: "#6f7269",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
  indicator: {
    color: colors.accent,
    fontSize: "8px",
  },
  error: {
    margin: 0,
    padding: "11px 22px",
    color: "#ef9a8f",
    backgroundColor: "rgba(170, 45, 34, 0.1)",
  },
  statusRow: {
    minHeight: "42px",
    marginTop: "12px",
    paddingInline: "2px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },
  statusDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
  },
  connectingDot: {
    backgroundColor: "#7cb4cc",
  },
  pausedDot: {
    backgroundColor: "#c6a869",
  },
  status: {
    margin: 0,
    color: "#85887e",
  },
});
