import { v5 as uuidv5 } from "uuid";

const workspaceBindingNamespace = "5af1ce44-a3c1-47c9-93fb-f765f61046e0";

export function workspaceIdForBindingSecret(bindingSecret: string) {
  return uuidv5(bindingSecret, workspaceBindingNamespace);
}
