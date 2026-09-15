import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base is "/" for a custom domain (Cloudflare). If you deploy to
// https://<user>.github.io/<repo>/ instead of a custom domain, set
// base to "/<repo>/" here or via the VITE_BASE_PATH env var.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
});
