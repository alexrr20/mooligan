import * as stylex from "@stylexjs/stylex";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
import { settingStyles } from "../../styles/settings";
import { Button } from "../../components/ui/button";
import { useWorkspaceBackup } from "./use-workspace-backup";

export function BackupSetting() {
  const backup = useWorkspaceBackup();
  return (
    <section {...stylex.props(styles.backup)} aria-labelledby="backup-heading">
      <div {...stylex.props(settingStyles.settingIntro)}>
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Data / Recovery</p>
          <h2
            {...stylex.props(typography.pageTitle, settingStyles.settingTitle)}
            id="backup-heading"
          >
            Keep your own copy.
          </h2>
        </div>
        <p {...stylex.props(typography.body, settingStyles.settingCopy)}>
          Export a validated copy of this workspace, including collection lots and spoiler choices.
          Backups never contain device preferences, account sessions, or credentials.
        </p>
      </div>

      <div {...stylex.props(styles.backupActions)}>
        <div {...stylex.props(styles.backupCopy)}>
          <strong {...stylex.props(typography.bodyLarge, styles.backupTitle)}>
            Workspace backup
          </strong>
          <span {...stylex.props(typography.bodySmall, settingStyles.accountEmail)}>
            Import replaces user-owned data only after validation and confirmation.
          </span>
        </div>
        <div {...stylex.props(settingStyles.accountActions)}>
          <Button disabled={backup.busy} onClick={() => backup.importBackup()} variant="secondary">
            Import
          </Button>
          <Button disabled={backup.busy} onClick={() => backup.exportBackup()}>
            Export backup
          </Button>
        </div>
      </div>

      {backup.error && (
        <p {...stylex.props(typography.bodySmall, settingStyles.accountError)} role="alert">
          {backup.error}
        </p>
      )}

      <div {...stylex.props(styles.statusRow)}>
        <span {...stylex.props(styles.localDot)} aria-hidden="true" />
        <p {...stylex.props(typography.label, styles.status)} aria-live="polite">
          {backupStatus(backup)}
        </p>
      </div>
    </section>
  );
}

function backupStatus(backup: ReturnType<typeof useWorkspaceBackup>) {
  if (backup.busy) {
    return "Preparing workspace…";
  }
  if (backup.result === "exported") {
    return "Backup exported";
  }
  if (backup.result === "imported") {
    return "Backup imported / saved locally";
  }
  return backup.error ? "Backup action failed" : "Local recovery available";
}

const styles = stylex.create({
  backup: {
    maxWidth: "980px",
    marginTop: "64px",
  },
  kicker: {
    margin: "0 0 12px",
    color: "#85887e",
  },
  backupActions: {
    minHeight: "100px",
    padding: "20px 22px",
    display: "flex",
    alignItems: {
      default: "center",
      "@media (max-width: 700px)": "stretch",
    },
    justifyContent: "space-between",
    flexDirection: {
      default: "row",
      "@media (max-width: 700px)": "column",
    },
    gap: "20px",
    backgroundColor: "#171914",
  },
  backupCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  backupTitle: {
    color: "#f4f1e8",
  },
  statusRow: {
    minHeight: "42px",
    marginTop: "12px",
    paddingInline: "2px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },
  localDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
  },
  status: {
    margin: 0,
    color: "#85887e",
  },
});
