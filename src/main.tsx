// SKELETON: Shared React entry point.
// MIX: Keep the design preview separate from live authentication and workspace services.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UiAndModalReference } from "./reference/ui-and-modal-reference";
import "./index.css";

const isUiReferenceRoute = window.location.pathname.replace(/\/+$/, "") === "/ui-reference";
const rootComponent = isUiReferenceRoute ? <UiAndModalReference /> : <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{rootComponent}</StrictMode>,
);
