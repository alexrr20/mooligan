export const themePreferences = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof themePreferences)[number];
export type MooliganColorScheme = Exclude<ThemePreference, "system">;
type SystemColorScheme = MooliganColorScheme | "unspecified" | null | undefined;

export const palettes = {
  light: {
    accent: "#11C565",
    accentText: "#08733B",
    background: "#F7F4EB",
    border: "#D8D5CA",
    controlBorder: "#8A8D84",
    pressed: "#ECE8DE",
    surface: "#FFFDF8",
    text: "#1B1D19",
    textSecondary: "#62665D",
  },
  dark: {
    accent: "#11C565",
    accentText: "#38D77F",
    background: "#0A0A0A",
    border: "#34372F",
    controlBorder: "#777B70",
    pressed: "#242620",
    surface: "#151613",
    text: "#F4F1E8",
    textSecondary: "#A9ADA2",
  },
} as const;

export type MooliganPalette = (typeof palettes)[MooliganColorScheme];

export function parseThemePreference(value: string | null): ThemePreference {
  return themePreferences.find((preference) => preference === value) ?? "system";
}

export function resolveColorScheme(
  preference: ThemePreference,
  systemColorScheme: SystemColorScheme,
): MooliganColorScheme {
  if (preference !== "system") {
    return preference;
  }

  return systemColorScheme === "dark" ? "dark" : "light";
}
