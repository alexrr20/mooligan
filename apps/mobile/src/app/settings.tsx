import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { themePreferences, type ThemePreference } from "@/theme/theme";
import { useMooliganTheme } from "@/theme/theme-provider";

const preferenceCopy = {
  system: {
    label: "System",
    description: "Follow this Device's appearance setting.",
  },
  light: {
    label: "Light",
    description: "Always use Mooligan's light appearance.",
  },
  dark: {
    label: "Dark",
    description: "Always use Mooligan's dark appearance.",
  },
} satisfies Record<ThemePreference, { label: string; description: string }>;

export default function SettingsScreen() {
  const { palette, preference, setPreference } = useMooliganTheme();

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
    >
      <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={[styles.sectionTitle, { color: palette.textSecondary }]}>APPEARANCE</Text>
          <View
            accessibilityRole="radiogroup"
            style={[
              styles.group,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {themePreferences.map((option, index) => {
              const selected = option === preference;
              const copy = preferenceCopy[option];

              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option}
                  onPress={() => setPreference(option)}
                  style={({ pressed }) => [
                    styles.option,
                    index < themePreferences.length - 1 && {
                      borderBottomColor: palette.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                    pressed && { backgroundColor: palette.pressed },
                  ]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, { color: palette.text }]}>{copy.label}</Text>
                    <Text style={[styles.optionDescription, { color: palette.textSecondary }]}>
                      {copy.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      { borderColor: selected ? palette.accent : palette.controlBorder },
                    ]}
                  >
                    {selected ? (
                      <View style={[styles.radioDot, { backgroundColor: palette.accent }]} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.sectionTitle, styles.aboutTitle, { color: palette.textSecondary }]}>
            ABOUT
          </Text>
          <View
            style={[
              styles.about,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.aboutName, { color: palette.text }]}>Mooligan mobile</Text>
            <Text style={[styles.aboutBody, { color: palette.textSecondary }]}>
              This foundation stores only the appearance choice on this Device. It does not create a
              Workspace or connect an Account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  safeArea: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
  content: {
    width: "100%",
    maxWidth: 720,
  },
  sectionTitle: {
    marginBottom: 9,
    marginLeft: 12,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  group: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  option: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  optionCopy: {
    flex: 1,
    paddingRight: 16,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 20,
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 11,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  aboutTitle: {
    marginTop: 34,
  },
  about: {
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  aboutName: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  aboutBody: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
  },
});
