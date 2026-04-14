import { defineConfig } from "tsdown";

/**
 * Build only the bin entry. The library itself ships as TypeScript source
 * (matching the rest of the bull-viewer monorepo) — only the bin needs
 * compiled JS so `npx bull-viewer-mcp` works without a TS loader.
 *
 * Workspace deps (`@grmkris/bull-viewer-api`, `-core`) are **bundled** into
 * the bin because they distribute `.ts` source and Node cannot resolve
 * them at runtime. Published npm deps are externalized so they resolve
 * from `node_modules` via the package's `dependencies` declaration.
 */
export default defineConfig({
  entry: ["src/bin.ts"],
  format: "esm",
  target: "node20",
  outDir: "dist",
  outExtensions: () => ({ js: ".mjs" }),
  clean: true,
  // Force-bundle the workspace packages — they ship as `.ts` source which
  // node cannot resolve at runtime, so they have to live inside `bin.mjs`.
  noExternal: [/^@grmkris\/bull-viewer-/],
  external: [
    "@modelcontextprotocol/sdk",
    "@orpc/client",
    "@orpc/server",
    "@orpc/zod",
    "bullmq",
    "ioredis",
    "zod",
  ],
});
