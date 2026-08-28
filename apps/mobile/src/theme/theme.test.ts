import { describe, expect, it } from "vite-plus/test";

import { parseThemePreference, resolveColorScheme } from "./theme";

describe("parseThemePreference", () => {
  it.each(["system", "light", "dark"] as const)("accepts %s", (preference) => {
    expect(parseThemePreference(preference)).toBe(preference);
  });

  it.each([null, "", "sepia"])("uses system for %s", (preference) => {
    expect(parseThemePreference(preference)).toBe("system");
  });
});

describe("resolveColorScheme", () => {
  it("respects an explicit preference", () => {
    expect(resolveColorScheme("light", "dark")).toBe("light");
    expect(resolveColorScheme("dark", "light")).toBe("dark");
  });

  it("follows the system preference", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
  });

  it("uses light when the system does not report a preference", () => {
    expect(resolveColorScheme("system", null)).toBe("light");
    expect(resolveColorScheme("system", "unspecified")).toBe("light");
  });
});
