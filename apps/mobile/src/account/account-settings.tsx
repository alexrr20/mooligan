import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMooliganTheme } from "@/theme/theme-provider";
import { useMobileAccount } from "./account-provider";

export function AccountSettings() {
  const { palette } = useMooliganTheme();
  const { account, auth, busy, configured, connected, error, runtime, workspace } =
    useMobileAccount();
  const disabled = busy || auth.pendingAuth;
  const status = !workspace
    ? "Opening your Workspace…"
    : runtime.sync
      ? connected
        ? "Sync connected"
        : "Sync is reconnecting. Your data is available locally."
      : runtime.syncIssue === "client-upgrade-required"
        ? "Update Mooligan to resume syncing."
        : runtime.syncIssue
          ? "Sync is paused. Your data is available locally."
          : "Stored on this Device";
  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: palette.textSecondary }]}>ACCOUNT AND SYNC</Text>
      <View
        style={[styles.group, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        <Text style={[styles.name, { color: palette.text }]}>
          {auth.user?.name ?? "Use Mooligan across Devices"}
        </Text>
        <Text style={[styles.body, { color: palette.textSecondary }]}>
          {auth.user?.email ??
            "Sign in to sync your Workspace with desktop. An Account is optional."}
        </Text>
        {!configured ? (
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Account sign-in is not configured in this build.
          </Text>
        ) : auth.pendingAuth ? (
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Finish signing in in your browser, or close it to cancel.
          </Text>
        ) : auth.user ? (
          <AccountButton
            label="Sign out"
            disabled={disabled}
            onPress={() => {
              void account.signOut();
            }}
          />
        ) : (
          <AccountButton
            label="Sign in with Google"
            disabled={disabled}
            onPress={() => {
              void account.signIn();
            }}
          />
        )}
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: palette.textSecondary }]}
        >
          {status}
        </Text>
        {configured && (auth.user || error) ? (
          <AccountButton
            label={busy ? "Connecting…" : "Retry connection"}
            disabled={disabled}
            onPress={() => {
              void account.refresh();
            }}
          />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.body, { color: palette.text }]}>
            {error}
          </Text>
        ) : null}
      </View>
      {runtime.workspaces.length > 1 ? (
        <View
          style={[
            styles.group,
            styles.workspaces,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.name, { color: palette.text }]}>Workspaces on this Device</Text>
          {runtime.workspaces.map((item) => (
            <AccountButton
              key={item.workspaceId}
              label={`${item.label}${item.accountAssociation === "account" ? " · Account" : " · Local"}${item.active ? " · Open" : ""}`}
              disabled={disabled || item.active}
              onPress={() => {
                void account.selectWorkspace(item.workspaceId);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function AccountButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useMooliganTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.pressed },
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text style={[styles.buttonText, { color: palette.accentText }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 34 },
  title: { marginBottom: 9, marginLeft: 12, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  group: { padding: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  name: { fontSize: 16, fontWeight: "600", lineHeight: 22 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  button: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  dimmed: { opacity: 0.5 },
  workspaces: { marginTop: 12 },
});
