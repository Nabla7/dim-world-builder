import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AppProvider } from "./ui.ts";
import { ReviewApp } from "./review/ReviewApp.tsx";

const isReview = new URLSearchParams(location.search).get("workspace") === "review";
const inDesktop = location.pathname.startsWith("/apps/");

// AppProvider: Desktop's skin (followed live), toasts, dialogs, and the zenoh-gateway data source the viewer reads
createRoot(document.getElementById("root")!).render(
  <AppProvider url={isReview && !inDesktop ? false : undefined}>
    {isReview ? <ReviewApp /> : <App />}
  </AppProvider>,
);
