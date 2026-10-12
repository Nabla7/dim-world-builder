import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AppProvider } from "./ui.ts";

// AppProvider: Desktop's skin (followed live), toasts, dialogs, and the zenoh-gateway data source the viewer reads
createRoot(document.getElementById("root")!).render(
  <AppProvider>
    <App />
  </AppProvider>,
);
