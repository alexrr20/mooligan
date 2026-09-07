import { DarkTheme, DefaultTheme, Link, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text } from "react-native";

import { AccountStartup } from "@/account/account-provider";

import { MooliganThemeProvider, useMooliganTheme } from "@/theme/theme-provider";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <MooliganThemeProvider>
      <AccountStartup>
        <AppNavigator />
      </AccountStartup>
    </MooliganThemeProvider>
  );
}

function AppNavigator() {
  const { colorScheme, palette } = useMooliganTheme();
  const baseNavigationTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseNavigationTheme,
    colors: {
      ...baseNavigationTheme.colors,
      primary: palette.accent,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
      notification: palette.accent,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: palette.background },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: styles.headerTitle,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Mooligan",
            headerRight: () => <SettingsHeaderButton />,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: "Settings",
            headerBackButtonDisplayMode: "minimal",
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}

function SettingsHeaderButton() {
  const { palette } = useMooliganTheme();

  return (
    <Link href="/settings" asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Settings"
        hitSlop={10}
        style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
      >
        <Text style={[styles.headerButtonText, { color: palette.accentText }]}>Settings</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    fontWeight: "600",
  },
  headerButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerButtonPressed: {
    opacity: 0.55,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
