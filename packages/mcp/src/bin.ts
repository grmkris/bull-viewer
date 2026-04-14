#!/usr/bin/env node
/**
 * Stdio MCP server entry point. Launched as a subprocess by Claude Desktop
 * / Claude Code CLI / agent SDKs. Reads connection details from env vars:
 *
 *   BULL_VIEWER_URL    — base URL of the running bull-viewer (default: http://localhost:4747/api)
 *   BULL_VIEWER_TENANT — tenant id (default: "default")
 *   BULL_VIEWER_TOKEN  — optional Bearer token for the remote endpoint
 */
import { runStdioServer } from "./stdio.ts";

await runStdioServer({
  url: process.env.BULL_VIEWER_URL ?? "http://localhost:4747/api",
  tenant: process.env.BULL_VIEWER_TENANT,
  token: process.env.BULL_VIEWER_TOKEN,
});
