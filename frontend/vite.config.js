import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev:   `npm run dev` serves on :5173 and forwards API and Django-admin requests
//        to Django on :8000, so the browser sees a single origin.
// Build: `npm run build` writes into ../backend/frontend_dist for Django to serve,
//        with asset URLs under /static/ to match Django's STATIC_URL.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/static/" : "/",
  build: { outDir: "../backend/frontend_dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/django-admin": "http://localhost:8000",
      "/static/admin": "http://localhost:8000",
    },
  },
}));
