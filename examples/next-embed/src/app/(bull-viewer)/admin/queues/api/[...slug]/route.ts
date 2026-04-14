import { createQueuesRouteHandlers } from "@grmkris/bull-viewer-next";

import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export const { GET, POST, PATCH, DELETE } = createQueuesRouteHandlers({
  connection: redis,
  queues: ["emails", "reports"],
  basePath: "/admin/queues/api",
  authorize: async () => {
    const session = await auth();
    if (!session?.user.isAdmin) {
      return { ok: false, status: 401, message: "unauthorized" };
    }
    return {
      ok: true,
      viewer: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      scopes: ["read"],
    };
  },
});
