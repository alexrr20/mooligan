import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import {
  palettes,
  parseThemePreference,
  resolveColorScheme,
  type MooliganColorScheme,
  type MooliganPalette,
  type ThemePreference,
} from "@/theme/theme";

const themePreferenceStorageKey = "mooligan.device.theme-preference";

type MooliganTheme = {
  colorScheme: MooliganColorScheme;
  palette: MooliganPalette;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const MooliganThemeContext = createContext<MooliganTheme | null>(null);

export function MooliganThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference | null>(null);

  useEffect(() => {
    let active = true;

    function finishRestore(nextPreference: ThemePreference) {
      if (!active) {
        return;
      }

      setPreferenceState(nextPreference);
      requestAnimationFrame(() => {
        void SplashScreen.hideAsync();
      });
    }

    void AsyncStorage.getItem(themePreferenceStorageKey).then(
      (storedPreference) => {
        finishRestore(parseThemePreference(storedPreference));
      },
      (error: Error) => {
        console.warn("Could not read the Device appearance preference.", error);
        finishRestore("system");
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    void AsyncStorage.setItem(themePreferenceStorageKey, nextPreference).catch((error: Error) => {
      console.warn("Could not save the Device appearance preference.", error);
    });
  }, []);

  if (preference === null) {
    return null;
  }

  const colorScheme = resolveColorScheme(preference, systemColorScheme);
  const value = {
    colorScheme,
    palette: palettes[colorScheme],
    preference,
    setPreference,
  };

  return <MooliganThemeContext.Provider value={value}>{children}</MooliganThemeContext.Provider>;
}

export function useMooliganTheme(): MooliganTheme {
  const theme = useContext(MooliganThemeContext);

  if (theme === null) {
    throw new Error("useMooliganTheme must be used inside MooliganThemeProvider.");
  }

  return theme;
}
