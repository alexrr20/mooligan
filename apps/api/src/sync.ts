import { env } from "cloudflare:workers";
import { type CallbackContext, makeDurableObject, makeWorker } from "@livestore/sync-cf/cf-worker";
import type { SyncMessage } from "@livestore/sync-cf/common";
import {
  workspaceEventSchemaVersion,
  workspaceSyncedEventSchema,
  workspaceSyncPayloadSchema,
} from "@mooligan/workspace";
import { Schema } from "effect";
import { jwtVerify, SignJWT } from "jose";
import { UuidSchema, StrictStruct } from "@mooligan/domain/schema";

import { accountOwnsWorkspace, decodeWorkspaceId } from "./workspace.js";

export const syncAudience = "mooligan-livestore-sync";
export const syncCredentialLifetimeSeconds = 5 * 60;
export const minimumWorkspaceEventSchemaVersion = workspaceEventSchemaVersion;
export const maximumWorkspaceEventSchemaVersion = workspaceEventSchemaVersion;

type WorkspaceSyncPayload = typeof workspaceSyncPayloadSchema.Type;
type SyncWorkerEnvironment = { SYNC_BACKEND: DurableObjectNamespace };
const SyncPayloadSchema: Schema.Schema<WorkspaceSyncPayload> = workspaceSyncPayloadSchema;
const decodeWorkspaceSyncedEvent = Schema.decodeUnknownPromise(workspaceSyncedEventSchema, {
  onExcessProperty: "error",
});

const decodeCredentialClaims = Schema.decodeUnknownSync(
  StrictStruct({
    aud: Schema.Literal(syncAudience),
    exp: Schema.Int,
    iat: Schema.Int,
    sub: UuidSchema,
    workspaceId: UuidSchema,
  }),
);
const decodeAppVersion = Schema.decodeSync(
  Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(64)),
);
const decodeEventSchemaVersion = Schema.decodeSync(Schema.NonNegativeInt);

export async function issueSyncCredential(
  environment: Pick<Env, "SYNC_CREDENTIAL_SECRET">,
  userId: string,
  workspaceId: string,
  appVersion: string,
  eventSchemaVersion: number,
) {
  decodeAppVersion(appVersion);
  const validatedEventSchemaVersion = decodeEventSchemaVersion(eventSchemaVersion);
  if (validatedEventSchemaVersion < minimumWorkspaceEventSchemaVersion) {
    throw new Error("The desktop client is too old to synchronize this workspace.");
  }
  if (validatedEventSchemaVersion > maximumWorkspaceEventSchemaVersion) {
    throw new Error("The sync server is too old to synchronize this workspace.");
  }

  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + syncCredentialLifetimeSeconds;
  const credential = await new SignJWT({ workspaceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience(syncAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(syncSecret(environment));

  return { credential, expiresAt };
}

export async function authorizeSyncPayload(
  environment: Pick<Env, "DB" | "SYNC_CREDENTIAL_SECRET">,
  payload: WorkspaceSyncPayload,
  requestedStoreId: string,
) {
  const storeId = decodeWorkspaceId(requestedStoreId);
  const payloadWorkspaceId = decodeWorkspaceId(payload.workspaceId);
  const { payload: rawClaims } = await jwtVerify(payload.credential, syncSecret(environment), {
    algorithms: ["HS256"],
    audience: syncAudience,
  });
  const claims = decodeCredentialClaims(rawClaims);

  if (
    storeId !== payloadWorkspaceId ||
    storeId !== claims.workspaceId ||
    claims.exp - claims.iat !== syncCredentialLifetimeSeconds
  ) {
    throw new Error("The sync credential does not authorize this workspace.");
  }

  if (!(await accountOwnsWorkspace(environment.DB, claims.sub, storeId))) {
    throw new Error("The account no longer owns this workspace.");
  }
}

async function authorizeSyncOperation({ headers, payload, storeId }: CallbackContext) {
  const decodedPayload = payload
    ? await Schema.decodeUnknownPromise(workspaceSyncPayloadSchema)(payload)
    : {
        credential: bearerCredential(headers?.get("authorization")),
        workspaceId: storeId,
      };
  await authorizeSyncPayload(env, decodedPayload, storeId);
}

async function authorizePush(message: SyncMessage.PushRequest, context: CallbackContext) {
  await authorizeSyncOperation(context);
  await Promise.all(
    message.batch.map(({ args, name }) => decodeWorkspaceSyncedEvent({ args, name })),
  );
}

export class WorkspaceSyncBackend extends makeDurableObject({
  enabledTransports: new Set(["http", "ws"]),
  forwardHeaders: ["authorization"],
  onPull: async (_message, context) => authorizeSyncOperation(context),
  onPush: authorizePush,
  storage: { _tag: "do-sqlite" },
}) {}

// @ts-expect-error -- LiveStore 0.4 recursively expands Cloudflare Durable Object types under TS 7.
export const syncWorker = makeWorker<SyncWorkerEnvironment, undefined, WorkspaceSyncPayload>({
  syncBackendBinding: "SYNC_BACKEND",
  syncPayloadSchema: SyncPayloadSchema,
  validatePayload: async (payload, { storeId }) => {
    await authorizeSyncPayload(env, payload, storeId);
  },
});

function syncSecret(environment: Pick<Env, "SYNC_CREDENTIAL_SECRET">) {
  const secret = new TextEncoder().encode(environment.SYNC_CREDENTIAL_SECRET);
  if (secret.byteLength < 32) {
    throw new Error("SYNC_CREDENTIAL_SECRET must contain at least 32 bytes.");
  }
  return secret;
}

function bearerCredential(authorization: string | undefined) {
  const match = /^Bearer ([^\s]+)$/u.exec(authorization ?? "");
  if (!match?.[1]) {
    throw new Error("A sync credential is required.");
  }
  return match[1];
}
