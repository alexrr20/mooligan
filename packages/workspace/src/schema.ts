import { makeSchema, Schema, State } from "@livestore/livestore";

import { collectionEvents, collectionMaterializers, collectionTables } from "./collection.ts";
import { deckEvents, deckMaterializers, deckTables } from "./decks.ts";
import {
  pricePreferenceEvents,
  pricePreferenceMaterializers,
  pricePreferenceTables,
} from "./price-preferences.ts";
import { profileEvents, profileMaterializers, profileTables } from "./profile.ts";
import { spoilerEvents, spoilerMaterializers, spoilerTables } from "./spoilers.ts";
import { tagEvents, tagMaterializers, tagTables } from "./tags.ts";

export const workspaceEventSchemaVersion = 7;

export const workspaceSyncPayloadSchema = Schema.Struct({
  credential: Schema.String.pipe(Schema.minLength(1)),
  workspaceId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
});

export const tables = {
  ...collectionTables,
  ...deckTables,
  ...pricePreferenceTables,
  ...profileTables,
  ...spoilerTables,
  ...tagTables,
};

export const events = {
  ...collectionEvents,
  ...deckEvents,
  ...pricePreferenceEvents,
  ...profileEvents,
  ...spoilerEvents,
  ...tagEvents,
} as const;

type WorkspaceSyncedEvent = {
  [Key in keyof typeof events]: {
    readonly args: (typeof events)[Key]["schema"]["Type"];
    readonly name: (typeof events)[Key]["name"];
  };
}[keyof typeof events];

export const workspaceSyncedEventSchema =
  // SAFETY: each member pairs one event's name with that event's args schema, so the union is
  // the correlated `WorkspaceSyncedEvent`; mapping `Object.values` only loses that pairing in types.
  Schema.Union(
    ...Object.values(events).map(({ name, schema }) =>
      Schema.Struct({ args: schema, name: Schema.Literal(name) }),
    ),
  ) as Schema.Schema<WorkspaceSyncedEvent>;

const materializers = State.SQLite.materializers(events, {
  ...collectionMaterializers,
  ...deckMaterializers,
  ...pricePreferenceMaterializers,
  ...profileMaterializers,
  ...spoilerMaterializers,
  ...tagMaterializers,
});

const state = State.SQLite.makeState({ tables, materializers });

export const workspaceSchema = makeSchema({ events, state });
