import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite config for the velt console SPA. `@` → src (mirrors tsconfig paths).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "0.0.0.0", // reachable from Windows host / Caddy vhost (admin.velt.local.vn)
    port: 5173,
    // Allow the Caddy-proxied dev host (and any *.velt.local.vn subdomain). Vite
    // blocks unknown Host headers by default (DNS-rebinding protection); the
    // leading dot whitelists the apex + all subdomains.
    allowedHosts: [".velt.local.vn"],
    // HMR runs through Caddy's TLS termination on 443 when using the vhost, so
    // the client must connect the websocket on 443 (not the raw 5173).
    hmr: { clientPort: 443 },
  },
});
