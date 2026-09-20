import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { AccountStartup } from "@/account/account-provider";
import { MooliganThemeProvider, useMooliganTheme } from "@/theme/theme-provider";
import { WorkspaceProvider } from "@/workspace/provider";

void SplashScreen.preventAutoHideAsync();
export default function RootLayout() {
  return (
    <MooliganThemeProvider>
      <AccountStartup>
        <WorkspaceProvider>
          <AppNavigator />
        </WorkspaceProvider>
      </AccountStartup>
    </MooliganThemeProvider>
  );
}
function AppNavigator() {
  const { colorScheme, palette } = useMooliganTheme();
  const base = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: palette.accent,
          background: palette.background,
          card: palette.background,
          text: palette.text,
          border: palette.border,
          notification: palette.accent,
        },
      }}
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: palette.background },
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="cards/[printingId]" options={{ title: "Card" }} />
        <Stack.Screen name="decks/[deckId]" options={{ title: "Deck" }} />
        <Stack.Screen name="sets" options={{ title: "Upcoming releases" }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
      </Stack>
    </ThemeProvider>
  );
}
