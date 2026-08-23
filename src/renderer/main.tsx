/// <reference path="../preload/index.d.ts" />

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MiniApp } from "@/components/mini-app";

import "../styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MiniApp />
  </StrictMode>,
);
