import { env } from "cloudflare:workers";
import { makeSignature } from "better-auth/crypto";

import { createAuth } from "../src/auth.ts";

export async function authenticatedTestUser(email: string) {
  const context = await createAuth(env).$context;
  const user = await context.internalAdapter.createUser({
    email,
    emailVerified: true,
    name: "Workspace Test",
  });
  const session = await context.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, env.BETTER_AUTH_SECRET);

  return {
    headers: new Headers({
      cookie: `better-auth.session_token=${session.token}.${signature}`,
    }),
    userId: user.id,
  };
}
