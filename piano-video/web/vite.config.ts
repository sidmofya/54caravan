import { defineConfig } from "vite";

// Serve the pipeline's output (notes.json, clip.wav) as static files.
export default defineConfig({
  publicDir: "../data",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
