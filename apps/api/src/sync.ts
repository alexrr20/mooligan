import { env } from "cloudflare:workers";
import { type CallbackContext, makeDurableObject, makeWorker } from "@livestore/sync-cf/cf-worker";
import { workspaceSyncPayloadSchema } from "@mooligan/workspace";
import { Schema } from "effect";
import { jwtVerify, SignJWT } from "jose";
import * as z from "zod";

import { accountOwnsWorkspace, WorkspaceIdSchema } from "./workspace.js";

export const syncAudience = "mooligan-livestore-sync";
export const syncCredentialLifetimeSeconds = 5 * 60;

type WorkspaceSyncPayload = typeof workspaceSyncPayloadSchema.Type;
type SyncWorkerEnvironment = { SYNC_BACKEND: DurableObjectNamespace };
const SyncPayloadSchema: Schema.Schema<WorkspaceSyncPayload> = workspaceSyncPayloadSchema;

const CredentialClaimsSchema = z
  .object({
    aud: z.literal(syncAudience),
    exp: z.number().int(),
    iat: z.number().int(),
    sub: z.uuid(),
    workspaceId: z.uuid(),
  })
  .strict();

export async function issueSyncCredential(
  environment: Pick<Env, "SYNC_CREDENTIAL_SECRET">,
  userId: string,
  workspaceId: string,
) {
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
  const storeId = WorkspaceIdSchema.parse(requestedStoreId);
  const payloadWorkspaceId = WorkspaceIdSchema.parse(payload.workspaceId);
  const { payload: rawClaims } = await jwtVerify(payload.credential, syncSecret(environment), {
    algorithms: ["HS256"],
    audience: syncAudience,
  });
  const claims = CredentialClaimsSchema.parse(rawClaims);

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

export class WorkspaceSyncBackend extends makeDurableObject({
  enabledTransports: new Set(["http", "ws"]),
  forwardHeaders: ["authorization"],
  onPull: async (_message, context) => authorizeSyncOperation(context),
  onPush: async (_message, context) => authorizeSyncOperation(context),
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
