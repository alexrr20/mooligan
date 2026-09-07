import { collectionLotsQuery, decksQuery } from "@mooligan/workspace/schema";
import { StyleSheet, Text, View } from "react-native";

import { useMooliganTheme } from "@/theme/theme-provider";
import { useMobileAccount } from "./account-provider";
import type { WorkspaceStore } from "./workspace-store";

export function WorkspaceSummary() {
  const { workspace } = useMobileAccount();
  return workspace ? <OpenWorkspaceSummary store={workspace.store} /> : null;
}

function OpenWorkspaceSummary({ store }: { store: WorkspaceStore }) {
  const { palette } = useMooliganTheme();
  const lots = store.useQuery(collectionLotsQuery);
  const decks = store.useQuery(decksQuery);
  const copies = lots.reduce((total, lot) => total + lot.quantity, 0);
  return (
    <View style={styles.summary}>
      <Text style={[styles.count, { color: palette.text }]}>{copies} cards in your Collection</Text>
      <Text style={[styles.count, { color: palette.text }]}>{decks.length} Decks</Text>
      <Text style={[styles.note, { color: palette.textSecondary }]}>
        Saved locally. Sign in through Settings to sync with desktop.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 24, alignItems: "center", gap: 8 },
  count: { fontSize: 18, fontWeight: "600" },
  note: { fontSize: 14, lineHeight: 21, textAlign: "center" },
});
