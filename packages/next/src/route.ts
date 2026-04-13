import "server-only";
import type { Authorize } from "@bull-viewer/api";
import { createQueuesApiHandler } from "@bull-viewer/api";
import { createRegistry } from "@bull-viewer/core/server";
import type { ConnectionOptions } from "bullmq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CreateQueuesRouteHandlersOptions {
  connection: ConnectionOptions;
  queues: string[];
  basePath?: string;
  authorize?: Authorize;
  readOnly?: boolean;
}

type Handler = (req: Request) => Promise<Response>;

export interface QueuesRouteHandlers {
  GET: Handler;
  POST: Handler;
  PATCH: Handler;
  DELETE: Handler;
}

export function createQueuesRouteHandlers(
  options: CreateQueuesRouteHandlersOptions
): QueuesRouteHandlers {
  const registry = createRegistry({
    connection: options.connection,
    queues: options.queues,
  });

  const handler = createQueuesApiHandler({
    registry,
    authorize: options.authorize,
    basePath: options.basePath,
    readOnly: options.readOnly,
  });

  return {
    GET: handler,
    POST: handler,
    PATCH: handler,
    DELETE: handler,
  };
}
