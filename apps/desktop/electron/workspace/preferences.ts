import * as z from "zod";
import type { JSONType } from "zod";

export type MotionPreference = "full" | "reduced" | "system";

export type Preferences = {
  motion: MotionPreference;
};

export type PreferencesUpdate = Partial<Preferences>;

type PreferenceDefinitions = {
  [Key in keyof Preferences]: {
    defaultValue: Preferences[Key];
    syncable: boolean;
  };
};

export const preferenceDefinitions = {
  motion: { defaultValue: "system", syncable: true },
} satisfies PreferenceDefinitions;

export const MotionPreferenceSchema = z.enum(["full", "reduced", "system"]);
export const PreferencesSchema = z.strictObject({ motion: MotionPreferenceSchema });
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
  throw new TypeError("Invalid motion preference.");
}
