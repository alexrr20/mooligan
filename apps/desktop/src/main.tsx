import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import "./global.css";
import { routeTree } from "./routeTree.gen";

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
    <App />
  </StrictMode>,
);

function App() {
  useEffect(() => {
    const refreshCatalog = () => {
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    };

    window.addEventListener("catalogready", refreshCatalog);
    return () => window.removeEventListener("catalogready", refreshCatalog);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
