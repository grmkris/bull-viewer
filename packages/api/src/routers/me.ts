import type { Scope, Viewer } from "@bull-viewer/core";

import { publicProcedure } from "../lib/orpc.ts";

export interface MeResponse {
  viewer: Viewer | null;
  scopes: Scope[];
}

export const meProcedure = publicProcedure.handler(
  ({ context }): MeResponse => ({
    viewer: context.viewer,
    scopes: [...context.scopes],
  })
);
