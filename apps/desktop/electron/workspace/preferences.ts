import * as z from "zod";
import type { JSONType } from "zod";

import type { Preferences, PreferencesUpdate } from "../../shared/desktop-api.ts";

export const MotionPreferenceSchema = z.enum(["system", "reduced", "full"]);

type PreferenceDefinitions = {
  [Key in keyof Preferences]: {
    defaultValue: Preferences[Key];
  };
};

export const preferenceDefinitions = {
  motion: { defaultValue: "system" },
} satisfies PreferenceDefinitions;

export const PreferencesSchema = z.strictObject({
  motion: MotionPreferenceSchema,
});
const PreferencesUpdateSchema = PreferencesSchema.partial();

export function validatePreferences(value: JSONType): Preferences {
  return PreferencesSchema.parse(value);
}

export function validatePreferencesUpdate(value: JSONType): PreferencesUpdate {
  const preferences = PreferencesUpdateSchema.safeParse(value);
  if (preferences.success) return preferences.data;

  const unknownKey = preferences.error.issues.find(({ code }) => code === "unrecognized_keys");
  if (unknownKey?.code === "unrecognized_keys") {
    throw new TypeError(`Unknown preference: ${unknownKey.keys[0]}.`);
  }
  if (preferences.error.issues.some(({ path }) => path[0] === "motion")) {
    throw new TypeError("Invalid motion preference.");
  }
  throw new TypeError("Invalid preference value.");
}
