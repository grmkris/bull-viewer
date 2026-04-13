import { createQueuesRouteHandlers } from "@bull-viewer/next"
import { redis } from "@/lib/redis"
import { auth } from "@/lib/auth"

export const { GET, POST, PATCH, DELETE } = createQueuesRouteHandlers({
  connection: redis,
  queues: ["emails", "reports"],
  basePath: "/admin/queues/api",
  authorize: async () => {
    const session = await auth()
    if (!session?.user.isAdmin) {
      return { ok: false, status: 401, message: "unauthorized" }
    }
    return {
      ok: true,
      viewer: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
      scopes: ["read"],
    }
  },
})
