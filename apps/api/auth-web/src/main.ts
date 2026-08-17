import { electronProxyClient } from "@better-auth/electron/proxy";
import { createAuthClient } from "better-auth/client";

import { parseElectronQuery } from "./auth-query";

const protocol = "com.mooligan.app";
const query = parseElectronQuery(new URLSearchParams(location.search));
const authClient = createAuthClient({
  baseURL: location.origin,
  plugins: [electronProxyClient({ protocol })],
});
const signInButton = button("sign-in");
const continueButton = button("continue");
const signedIn = element("signed-in");
const signedOut = element("signed-out");
const identity = element("identity");
const errorMessage = element("error");
const redirectTimer = authClient.ensureElectronRedirect({ timeout: 5 * 60 * 1_000 });
window.addEventListener("pagehide", () => clearInterval(redirectTimer), { once: true });

if (!query) {
  showError("This sign-in link is incomplete. Return to Mooligan and try again.");
  signInButton.disabled = true;
} else {
  void showSession();
}

signInButton.addEventListener("click", () => {
  if (!query) {
    return;
  }

  setBusy(signInButton, true);
  void authClient.signIn
    .social({ provider: "google", fetchOptions: { query } })
    .then(({ error }) => {
      if (error) {
        throw error;
      }
    })
    .catch(() => {
      setBusy(signInButton, false);
      showError("Google sign-in could not be started. Please try again.");
    });
});

continueButton.addEventListener("click", () => {
  if (!query) {
    return;
  }

  setBusy(continueButton, true);
  void authClient.electron
    .transferUser({ fetchOptions: { query } })
    .then(({ error }) => {
      if (error) {
        throw error;
      }
    })
    .catch(() => {
      setBusy(continueButton, false);
      showError("This account could not be sent to Mooligan. Please try again.");
    });
});

async function showSession() {
  try {
    const { data } = await authClient.getSession();

    if (!data) {
      return;
    }

    identity.textContent = `Signed in as ${data.user.name}`;
    signedOut.hidden = true;
    signedIn.hidden = false;
  } catch {
    // A browser session is optional; the provider button can still start sign-in.
  }
}

function setBusy(button: HTMLButtonElement, busy: boolean) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

function showError(message: string) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function element(id: string) {
  const value = document.getElementById(id);

  if (!(value instanceof HTMLElement)) {
    throw new Error(`Missing sign-in element: ${id}`);
  }

  return value;
}

function button(id: string) {
  const value = element(id);
  if (!(value instanceof HTMLButtonElement)) {
    throw new Error(`Invalid sign-in button: ${id}`);
  }
  return value;
}
