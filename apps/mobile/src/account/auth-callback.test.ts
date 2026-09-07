import { expect, test } from "vite-plus/test";
import { redirectSystemPath } from "../app/+native-intent";

test("Expo browser callback cookies never enter router state", () => {
  for (const initial of [true, false]) {
    expect(redirectSystemPath({ path: "com.mooligan.app://settings?cookie=secret", initial })).toBe(
      "/settings",
    );
    expect(redirectSystemPath({ path: "com.mooligan.app://settings?error=denied", initial })).toBe(
      "/settings",
    );
    expect(
      redirectSystemPath({ path: "com.mooligan.app:///settings?cookie=secret", initial }),
    ).toBe("/settings");
    expect(redirectSystemPath({ path: "/settings?cookie=secret", initial })).toBe("/settings");
    expect(redirectSystemPath({ path: "/collection", initial })).toBe("/collection");
  }
});
