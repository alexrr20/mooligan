import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useMooliganTheme } from "@/theme/theme-provider";

export default function HomeScreen() {
  const { palette } = useMooliganTheme();

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safeArea}>
        <View style={styles.content}>
          <Image
            accessibilityIgnoresInvertColors
            source={require("../../assets/images/brand-mark.png")}
            style={styles.mark}
          />
          <Text style={[styles.eyebrow, { color: palette.accentText }]}>MOOLIGAN MOBILE</Text>
          <Text style={[styles.title, { color: palette.text }]}>
            Your Workspace will live here.
          </Text>
          <Text style={[styles.body, { color: palette.textSecondary }]}>
            Mooligan mobile is set up, but it does not create or sync a Workspace yet. Cards, your
            Collection, and Decks come next.
          </Text>

          <View
            style={[styles.note, { backgroundColor: palette.surface, borderColor: palette.border }]}
          >
            <View style={[styles.noteAccent, { backgroundColor: palette.accent }]} />
            <View style={styles.noteCopy}>
              <Text style={[styles.noteTitle, { color: palette.text }]}>
                An Account stays optional
              </Text>
              <Text style={[styles.noteBody, { color: palette.textSecondary }]}>
                Core card, Collection, and Deck work will remain available locally on this Device.
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  content: {
    width: "100%",
    maxWidth: 640,
    alignItems: "center",
  },
  mark: {
    width: 96,
    height: 96,
    marginBottom: 18,
  },
  eyebrow: {
    marginBottom: 14,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  title: {
    maxWidth: 520,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 44,
    textAlign: "center",
  },
  body: {
    maxWidth: 500,
    marginTop: 18,
    fontSize: 17,
    lineHeight: 26,
    textAlign: "center",
  },
  note: {
    width: "100%",
    maxWidth: 520,
    minHeight: 88,
    marginTop: 36,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  noteAccent: {
    width: 4,
  },
  noteCopy: {
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  noteBody: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
});
