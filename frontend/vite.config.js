import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // API_PORT lets a second backend run alongside yours (testing)
    proxy: { "/api": `http://localhost:${process.env.API_PORT || 8000}` },
  },
});
