export type {
  Authorize,
  AuthorizeResult,
  ViewerContext,
} from "./lib/context.ts";
export { ALLOW_ALL } from "./lib/context.ts";

export type { CreateQueuesApiHandlerOptions, Handler } from "./lib/handler.ts";
export { createQueuesApiHandler } from "./lib/handler.ts";

export type {
  TenantConfig,
  TenantOptionsInput,
  NormalizedTenants,
} from "./lib/tenants.ts";
export { TenantOptionsError, normalizeTenantOptions } from "./lib/tenants.ts";

export type { Logger, LogLevel } from "./lib/logger.ts";
export { createConsoleLogger, silentLogger } from "./lib/logger.ts";

export type { AppRouter, AppRouterClient } from "./router.ts";
export { appRouter } from "./router.ts";

// Re-export SearchProvider so host apps can type their custom provider
// before passing it to `createQueuesApiHandler({ searchProvider })`.
export type {
  SearchProvider,
  SearchInput,
  SearchResult,
} from "@grmkris/bull-viewer-core/server";

// Router type is the canonical typed contract for client construction.
// Consumers build a typed client via:
//   import type { AppRouter } from "@grmkris/bull-viewer-api"
//   import { createORPCClient } from "@orpc/client"
//   const client: RouterClient<AppRouter> = createORPCClient(link)
