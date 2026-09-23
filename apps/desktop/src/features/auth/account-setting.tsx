import * as stylex from "@stylexjs/stylex";
import { colors } from "../../styles/tokens.stylex.js";
import { typography } from "../../styles/typography";
import { settingStyles } from "../../styles/settings";
import type { AuthSnapshot, AuthStatus } from "@mooligan/account/runtime";
import { Button } from "../../components/ui/button";
import { useAuth } from "./use-auth";

export function AccountSetting() {
  const auth = useAuth();
  const { snapshot } = auth;
  const signedIn = snapshot.user !== null || snapshot.status === "session-unavailable";

  return (
    <section {...stylex.props(styles.account)} aria-label="Account">
      <div {...stylex.props(styles.accountPanel)}>
        <div {...stylex.props(styles.accountState)}>
          <span
            {...stylex.props(
              typography.control,
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
            <span {...stylex.props(typography.bodySmall, settingStyles.accountEmail)}>
              {snapshot.user?.email ?? accountDescription(snapshot.status)}
            </span>
          </div>
          <span {...stylex.props(typography.label, styles.accountBadge)}>
            {accountBadge(snapshot.status)}
          </span>
        </div>

        <div {...stylex.props(settingStyles.accountActions)}>
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
              <span {...stylex.props(typography.control)} aria-hidden="true">
                ↗
              </span>
            </Button>
          )}
        </div>
      </div>

      {auth.error && (
        <p {...stylex.props(typography.bodySmall, settingStyles.accountError)} role="alert">
          {auth.error}
        </p>
      )}
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

const styles = stylex.create({
  account: {
    maxWidth: "980px",
    marginBottom: "64px",
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
    borderRadius: "12px",
  },
  accountGlyphSignedIn: {
    color: "#0a0a0a",
    backgroundColor: colors.accent,
  },
  accountGlyphPaused: {
    color: "#171914",
    backgroundColor: "#c6a869",
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
  accountBadge: {
    flex: "0 0 auto",
    marginLeft: "8px",
    padding: "5px 8px",
    color: "#a6a89d",
    borderRadius: "999px",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
});
