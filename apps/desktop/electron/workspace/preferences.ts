export type MotionPreference = "full" | "reduced" | "system";

export type Preferences = {
  motion: MotionPreference;
};

export type PreferencesUpdate = Partial<Preferences>;

export const preferenceDefinitions: {
  [Key in keyof Preferences]: {
    defaultValue: Preferences[Key];
    syncable: boolean;
  };
} = {
  motion: { defaultValue: "system", syncable: true },
};

const motionPreferences: readonly MotionPreference[] = ["full", "reduced", "system"];

export function validatePreferences(value: unknown): Preferences {
  const preferences = validatePreferencesUpdate(value);

  if (preferences.motion === undefined) {
    throw new TypeError("Missing preference: motion.");
  }

  return { motion: preferences.motion };
}

export function validatePreferencesUpdate(value: unknown): PreferencesUpdate {
  if (!isPlainRecord(value)) {
    throw new TypeError("Preference update must be an object.");
  }

  const unknownKey = Object.keys(value).find((key) => key !== "motion");

  if (unknownKey) {
    throw new TypeError(`Unknown preference: ${unknownKey}.`);
  }

  if (!Object.hasOwn(value, "motion")) {
    return {};
  }

  if (!motionPreferences.includes(value.motion as MotionPreference)) {
    throw new TypeError("Invalid motion preference.");
  }

  return { motion: value.motion as MotionPreference };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
