import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import tsconfigPaths from "vite-tsconfig-paths"
import type { Plugin } from "vite"

const mode = process.env.VITE_BUILD_MODE ?? "standalone"

const injectUseClient = (): Plugin => ({
  name: "inject-use-client",
  generateBundle(_options, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === "chunk") {
        file.code = '"use client";\n' + file.code
      }
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    ...(mode === "lib" ? [injectUseClient()] : []),
  ],
  build:
    mode === "lib"
      ? {
          lib: {
            entry: "src/embed.tsx",
            formats: ["es"],
            fileName: () => "index.js",
          },
          rollupOptions: {
            external: [
              "react",
              "react-dom",
              "react/jsx-runtime",
              "@tanstack/react-router",
            ],
          },
          cssCodeSplit: false,
        }
      : {
          outDir: "dist/standalone",
        },
})
