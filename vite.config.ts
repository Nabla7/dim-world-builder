/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Desktop serves the page at /apps/<name>/, so every URL in the build is relative ("./").
const desktop = "http://127.0.0.1:5555";
// `deno task serve` port (API_PORT=… when 8787 is taken)
const backend = `http://127.0.0.1:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    // `deno task dev` (:5173) next to `deno task serve` (:8787) and a running Desktop (:5555)
    proxy: {
      "/api/notifications": desktop,
      "/api": backend,
      "/files": backend,
      "/theme.css": desktop,
      "/shell": desktop,
      "/dimos": desktop,
      "/apps": desktop,
      "/zenoh-gateway": { target: desktop, ws: true },
    },
  },
  build: {
    target: "es2022",
  },
  test: {
    // UI tests (.test.tsx) opt into happy-dom per file via @vitest-environment; the rest stay on node.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // Vitest's default forks pool needs Node child-process IPC, which Deno does not emulate reliably.
    pool: "threads",
  },
});
