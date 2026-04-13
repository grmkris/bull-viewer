import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BullViewerApp } from "./embed.tsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root element");

createRoot(rootEl).render(
  <StrictMode>
    <BullViewerApp basePath="/" apiBase="/api" />
  </StrictMode>
);
