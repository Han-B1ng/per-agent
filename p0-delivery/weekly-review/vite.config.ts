import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const deliveryRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: { allow: [deliveryRoot] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
