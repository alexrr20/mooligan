import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "../components/button";
import { PageFrame } from "../components/page-frame";
import { useAuth } from "../features/auth/use-auth";
import {
  useMotionPreference,
  type MotionPreference,
} from "../features/preferences/use-motion-preference";
import { useWorkspaceBackup } from "../features/preferences/use-workspace-backup";
import { SpoilerSettings } from "../features/spoilers/spoiler-settings";
import { WorkspaceSetting } from "../features/workspace/workspace-setting";
import { colors } from "../styles/tokens.stylex.js";
import { typography } from "../styles/typography";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
function SettingsPage() {
  const auth = useAuth();
  const backup = useWorkspaceBackup();
  const { motion, setMotion } = useMotionPreference();

  return (
    <PageFrame>
      <AccountSetting auth={auth} />

      <WorkspaceSetting />

      <section {...stylex.props(styles.setting)} aria-labelledby="motion-heading">
        <div {...stylex.props(styles.settingIntro)}>
          <div>
            <p {...stylex.props(typography.label, styles.kicker)}>Appearance / Motion</p>
            <h2 {...stylex.props(typography.pageTitle, styles.settingTitle)} id="motion-heading">
              Choose the pace.
            </h2>
          </div>
          <p {...stylex.props(typography.body, styles.settingCopy)}>
            Follow your operating system, keep transitions restrained, or show every interface
            movement. This preference is saved on this device.
          </p>
        </div>

        <fieldset {...stylex.props(styles.options)} aria-describedby="motion-status">
          <legend {...stylex.props(styles.visuallyHidden)}>Motion behavior</legend>
          {motionOptions.map((option, index) => {
            const selected = motion === option.value;

            return (
              <label
                {...stylex.props(styles.option, selected && styles.optionSelected)}
                key={option.value}
              >
                <input
                  {...stylex.props(styles.radio)}
                  checked={selected}
                  name="motion"
                  onChange={() => setMotion(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span {...stylex.props(typography.label, styles.optionNumber)}>0{index + 1}</span>
                <span {...stylex.props(styles.optionBody)}>
                  <strong {...stylex.props(typography.heading, styles.optionTitle)}>
                    {option.label}
                  </strong>
                  <span {...stylex.props(typography.bodySmall, styles.optionCopy)}>
                    {option.description}
                  </span>
                </span>
                <span {...stylex.props(styles.optionMark)} aria-hidden="true">
                  {selected ? "●" : "○"}
                </span>
              </label>
            );
          })}
        </fieldset>

        <div {...stylex.props(styles.statusRow)}>
          <span {...stylex.props(styles.localDot)} aria-hidden="true" />
          <p
            {...stylex.props(typography.label, styles.status)}
            id="motion-status"
            aria-live="polite"
          >
            Saved on this device
          </p>
        </div>
      </section>

      <SpoilerSettings />

      <BackupSetting backup={backup} />
    </PageFrame>
  );
}

function AccountSetting({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const { snapshot } = auth;
  const signedIn = snapshot.user !== null || snapshot.status === "session-unavailable";

  return (
    <section {...stylex.props(styles.account)} aria-labelledby="account-heading">
      <div {...stylex.props(styles.settingIntro)}>
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Account / Optional</p>
          <h1 {...stylex.props(typography.pageTitle, styles.settingTitle)} id="account-heading">
            Local by default.
          </h1>
        </div>
        <p {...stylex.props(typography.body, styles.settingCopy)}>
          Sign in to connect an online identity. Your library stays in its local workspace and
          remains available if the account service is offline.
        </p>
      </div>

      <div {...stylex.props(styles.accountPanel)}>
        <div {...stylex.props(styles.accountState)}>
          <span
            {...stylex.props(
              styles.accountGlyph,
              signedIn && styles.accountGlyphSignedIn,
              snapshot.status === "session-unavailable" && styles.accountGlyphPaused,
            )}
            aria-hidden="true"
          >
            {snapshot.user ? initials(snapshot.user.name) : "M"}
          </span>
          <div {...stylex.props(styles.accountIdentity)}>
            <strong {...stylex.props(typography.bodyLarge, styles.accountName)}>
              {accountTitle({ loading: auth.loading, snapshot })}
            </strong>
            <span {...stylex.props(typography.bodySmall, styles.accountEmail)}>
              {snapshot.user?.email ?? accountDescription(snapshot.status)}
            </span>
          </div>
          <span {...stylex.props(typography.label, styles.accountBadge)}>
            {accountBadge(snapshot.status)}
          </span>
        </div>

        <div {...stylex.props(styles.accountActions)}>
          {signedIn ? (
            <>
              {snapshot.status === "session-unavailable" && (
                <Button disabled={auth.busy} onClick={() => auth.refresh()} variant="secondary">
                  Retry connection
                </Button>
              )}
              <Button disabled={auth.busy} onClick={() => auth.signOut()} variant="secondary">
                Sign out
              </Button>
            </>
          ) : (
            <Button
              disabled={auth.busy || snapshot.status === "protected-storage-unavailable"}
              onClick={() => auth.signIn()}
            >
              Continue with Google
              <span aria-hidden="true">↗</span>
            </Button>
          )}
        </div>
      </div>

      {auth.error && (
        <p {...stylex.props(typography.bodySmall, styles.accountError)} role="alert">
          {auth.error}
        </p>
      )}

      <div {...stylex.props(styles.statusRow)}>
        <span
          {...stylex.props(
            styles.localDot,
            snapshot.status === "session-unavailable" && styles.pausedDot,
          )}
          aria-hidden="true"
        />
        <p {...stylex.props(typography.label, styles.status)} aria-live="polite">
          {auth.busy ? "Working…" : accountStatus(snapshot.status)}
        </p>
      </div>
    </section>
  );
}

function BackupSetting({ backup }: { backup: ReturnType<typeof useWorkspaceBackup> }) {
  return (
    <section {...stylex.props(styles.backup)} aria-labelledby="backup-heading">
      <div {...stylex.props(styles.settingIntro)}>
        <div>
          <p {...stylex.props(typography.label, styles.kicker)}>Data / Recovery</p>
          <h2 {...stylex.props(typography.pageTitle, styles.settingTitle)} id="backup-heading">
            Keep your own copy.
          </h2>
        </div>
        <p {...stylex.props(typography.body, styles.settingCopy)}>
          Export a validated copy of this workspace, including collection lots and spoiler choices.
          Backups never contain device preferences, account sessions, or credentials.
        </p>
      </div>

      <div {...stylex.props(styles.backupActions)}>
        <div {...stylex.props(styles.backupCopy)}>
          <strong {...stylex.props(typography.bodyLarge, styles.backupTitle)}>
            Workspace backup
          </strong>
          <span {...stylex.props(typography.bodySmall, styles.accountEmail)}>
            Import replaces user-owned data only after validation and confirmation.
          </span>
        </div>
        <div {...stylex.props(styles.accountActions)}>
          <Button disabled={backup.busy} onClick={() => backup.importBackup()} variant="secondary">
            Import
          </Button>
          <Button disabled={backup.busy} onClick={() => backup.exportBackup()}>
            Export backup
          </Button>
        </div>
      </div>

      {backup.error && (
        <p {...stylex.props(typography.bodySmall, styles.accountError)} role="alert">
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "M";
}

function accountTitle({ loading, snapshot }: { loading: boolean; snapshot: AuthSnapshot }) {
  if (loading) {
    return "Reading protected session…";
  }
  if (snapshot.user) {
    return snapshot.user.name;
  }
  if (snapshot.status === "protected-storage-unavailable") {
    return "Protected storage unavailable";
  }
  if (snapshot.status === "session-unavailable") {
    return "Account session offline";
  }
  return "No account connected";
}

function accountDescription(status: AuthStatus) {
  if (status === "protected-storage-unavailable") {
    return "Sign-in is disabled; the local workspace still works.";
  }
  if (status === "session-unavailable") {
    return "The local workspace is available while the account service reconnects.";
  }
  return "Keep using this device, or connect an optional account.";
}

function accountBadge(status: AuthStatus) {
  if (status === "signed-in") {
    return "Connected";
  }
  if (status === "session-unavailable") {
    return "Offline";
  }
  return "Local only";
}

function accountStatus(status: AuthStatus) {
  if (status === "signed-in") {
    return "Local access ready / account connected";
  }
  if (status === "session-unavailable") {
    return "Local access ready / account service unavailable";
  }
  if (status === "protected-storage-unavailable") {
    return "Local access ready / account storage unavailable";
  }
  return "Local access ready / no account required";
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

const motionOptions: readonly {
  description: string;
  label: string;
  value: MotionPreference;
}[] = [
  {
    description: "Use the reduced-motion setting from this computer.",
    label: "System",
    value: "system",
  },
  {
    description: "Remove decorative movement and keep state changes direct.",
    label: "Reduced",
    value: "reduced",
  },
  {
    description: "Show the complete set of transitions and interactions.",
    label: "Full",
    value: "full",
  },
];

const styles = stylex.create({
  account: {
    maxWidth: "980px",
    marginBottom: "64px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  backup: {
    maxWidth: "980px",
    marginTop: "64px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  setting: {
    maxWidth: "980px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  settingIntro: {
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
  settingTitle: {
    margin: 0,
    color: "#f4f1e8",
  },
  settingCopy: {
    maxWidth: "520px",
    margin: 0,
    color: "#a6a89d",
  },
  accountPanel: {
    minHeight: "112px",
    padding: "22px",
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
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
  },
  accountState: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  accountGlyph: {
    width: "46px",
    height: "46px",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    color: "#85887e",
    backgroundColor: "#20221d",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#34362f",
    borderRadius: "50%",
    fontSize: "11px",
    letterSpacing: "0.04em",
  },
  accountGlyphSignedIn: {
    color: "#0a0a0a",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  accountGlyphPaused: {
    color: "#171914",
    backgroundColor: "#c6a869",
    borderColor: "#c6a869",
  },
  accountIdentity: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  accountName: {
    overflow: "hidden",
    color: "#f4f1e8",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountEmail: {
    overflow: "hidden",
    maxWidth: "430px",
    color: "#85887e",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountBadge: {
    flex: "0 0 auto",
    marginLeft: "8px",
    padding: "5px 8px",
    color: "#a6a89d",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#34362f",
    borderRadius: "999px",
  },
  accountActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
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
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
  },
  backupCopy: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  backupTitle: {
    color: "#f4f1e8",
  },
  accountError: {
    margin: 0,
    padding: "11px 22px",
    color: "#ef9a8f",
    backgroundColor: "rgba(170, 45, 34, 0.1)",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#5d332e",
  },
  options: {
    minWidth: 0,
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 820px)": "1fr",
    },
    borderWidth: 0,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
  },
  option: {
    minHeight: "138px",
    padding: "18px",
    position: "relative",
    display: "grid",
    gridTemplateColumns: "28px 1fr auto",
    gap: "12px",
    color: "#a6a89d",
    backgroundColor: "rgba(255, 255, 255, 0.018)",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "#34362f",
    cursor: "pointer",
    transition: "color 160ms ease, background-color 160ms ease",
    ":last-child": {
      borderRightWidth: 0,
    },
    ":hover": {
      color: "#f4f1e8",
      backgroundColor: "rgba(255, 255, 255, 0.045)",
    },
    ":focus-within": {
      outlineWidth: "2px",
      outlineStyle: "solid",
      outlineColor: colors.accent,
      outlineOffset: "-2px",
    },
  },
  optionSelected: {
    color: "#f4f1e8",
    backgroundColor: "#171914",
  },
  radio: {
    width: "1px",
    height: "1px",
    position: "absolute",
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none",
  },
  optionNumber: {
    color: "#85887e",
  },
  optionBody: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  optionTitle: {
    color: "inherit",
  },
  optionCopy: {
    maxWidth: "210px",
    color: "#85887e",
  },
  optionMark: {
    color: colors.accent,
    fontSize: "12px",
  },
  statusRow: {
    minHeight: "42px",
    paddingInline: "2px",
    display: "flex",
    alignItems: "center",
    gap: "9px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "#34362f",
  },
  localDot: {
    width: "5px",
    height: "5px",
    borderRadius: "50%",
    backgroundColor: colors.accent,
  },
  pausedDot: {
    backgroundColor: "#c6a869",
  },
  status: {
    margin: 0,
    color: "#85887e",
  },
  visuallyHidden: {
    width: "1px",
    height: "1px",
    position: "absolute",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
  },
});
