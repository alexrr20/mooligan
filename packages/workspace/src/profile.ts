import { Events, queryDb, Schema, State } from "@livestore/livestore";

import { emptyProfile, profileSettingsSchema, type ProfileSettings } from "./profile-contract.ts";

export const profileTables = {
  profile: State.SQLite.table({
    name: "profile",
    schema: Schema.Struct({
      id: Schema.Literal("profile").pipe(State.SQLite.withPrimaryKey),
      bannerPrintingId: profileSettingsSchema.fields.bannerPrintingId,
      featuredPrintingIds: Schema.String,
    }),
  }),
};

export const profileEvents = {
  profileChanged: Events.synced({ name: "v1.ProfileChanged", schema: profileSettingsSchema }),
};

export const profileMaterializers = {
  "v1.ProfileChanged": (profile: ProfileSettings) => {
    const values = {
      bannerPrintingId: profile.bannerPrintingId,
      featuredPrintingIds: JSON.stringify(profile.featuredPrintingIds),
    };
    return profileTables.profile
      .insert({ id: "profile", ...values })
      .onConflict("id", "update", values);
  },
};

export const profileQuery = queryDb(profileTables.profile.select().first(), {
  label: "profile",
});

const decodeFeaturedPrintings = Schema.decodeUnknownSync(
  Schema.parseJson(profileSettingsSchema.fields.featuredPrintingIds),
);

export function readProfile(row: typeof profileTables.profile.Type | undefined): ProfileSettings {
  return row
    ? {
        bannerPrintingId: row.bannerPrintingId,
        featuredPrintingIds: decodeFeaturedPrintings(row.featuredPrintingIds),
      }
    : emptyProfile;
}
