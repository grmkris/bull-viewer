import {
  createRootRoute,
  createRoute,
  createRouter,
  createBrowserHistory,
  createMemoryHistory,
  Outlet,
  Link,
} from "@tanstack/react-router"
import type { RouterHistory } from "@tanstack/react-router"
import { QueueList } from "./pages/QueueList.tsx"
import { QueueDetail } from "./pages/QueueDetail.tsx"
import { JobDetail } from "./pages/JobDetail.tsx"

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: QueueList,
})

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "queues/$name",
  component: QueueDetail,
})

const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "queues/$name/jobs/$id",
  component: JobDetail,
})

const routeTree = rootRoute.addChildren([indexRoute, queueRoute, jobRoute])

export interface CreateBullViewerRouterOptions {
  basePath?: string
  history?: "browser" | "memory"
}

export function createBullViewerRouter(
  options: CreateBullViewerRouterOptions = {},
) {
  const basePath = options.basePath ?? "/"
  const history: RouterHistory =
    options.history === "memory"
      ? createMemoryHistory({ initialEntries: ["/"] })
      : createBrowserHistory()

  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    defaultPreload: "intent",
  })
}

function RootLayout() {
  return (
    <div className="bv-root bg-background text-foreground min-h-svh">
      <header className="bg-card sticky top-0 z-10 border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="font-heading text-sm font-semibold tracking-tight"
          >
            bull-viewer
          </Link>
          <span className="text-muted-foreground text-[0.625rem] uppercase">
            BullMQ
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  )
}

export type BullViewerRouter = ReturnType<typeof createBullViewerRouter>

declare module "@tanstack/react-router" {
  interface Register {
    router: BullViewerRouter
  }
}
