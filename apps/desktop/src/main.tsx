import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import manaFontUrl from "mana-font/fonts/mana.woff2?url";

import "./global.css";
import { subscribeToCollectionChanges } from "./features/collection/collection-cache";
import { routeTree } from "./routeTree.gen";
import { WorkspaceStartup } from "./features/workspace/workspace-startup";

document.fonts.add(
  new FontFace("Mana", `url("${manaFontUrl}") format("woff2")`, {
    style: "normal",
    weight: "400",
  }),
);

const router = createRouter({
  getScrollRestorationKey: (location) => location.href,
  history: createHashHistory(),
  routeTree,
  scrollRestoration: true,
});
const queryClient = new QueryClient();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing desktop root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WorkspaceStartup>
        <App />
      </WorkspaceStartup>
    </QueryClientProvider>
  </StrictMode>,
);

function App() {
  useEffect(() => {
    const refreshCatalog = () => {
      void queryClient.resetQueries({ queryKey: ["catalog"] });
    };

    window.addEventListener("catalogready", refreshCatalog);
    return () => window.removeEventListener("catalogready", refreshCatalog);
  }, []);

  useEffect(() => subscribeToCollectionChanges(queryClient), []);

  return <RouterProvider router={router} />;
}
