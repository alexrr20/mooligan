import * as z from "zod";
import type { JSONType } from "zod";

import { SpoilerPolicySchema, type SpoilerPolicy } from "@mooligan/domain/spoilers";

export type MotionPreference = "full" | "reduced" | "system";

export type Preferences = {
  motion: MotionPreference;
  spoilerPolicy: SpoilerPolicy;
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
  spoilerPolicy: { defaultValue: "protect", syncable: true },
} satisfies PreferenceDefinitions;

export const MotionPreferenceSchema = z.enum(["full", "reduced", "system"]);
export const PreferencesSchema = z.strictObject({
  motion: MotionPreferenceSchema,
  spoilerPolicy: SpoilerPolicySchema,
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
  if (preferences.error.issues.some(({ path }) => path[0] === "spoilerPolicy")) {
    throw new TypeError("Invalid spoiler policy.");
  }
  throw new TypeError("Invalid preference value.");
}
