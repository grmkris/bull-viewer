import {
  createRootRoute,
  createRoute,
  createRouter,
  createBrowserHistory,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router"
import type { RouterHistory } from "@tanstack/react-router"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { QueueList } from "./pages/QueueList.tsx"
import { QueueDetail } from "./pages/QueueDetail.tsx"
import { JobDetail } from "./pages/JobDetail.tsx"
import { AppSidebar } from "./shell/AppSidebar.tsx"
import { AppHeader } from "./shell/AppHeader.tsx"
import { MobileTabBar } from "./shell/MobileTabBar.tsx"
import { CommandPalette } from "./shell/CommandPalette.tsx"

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
    <TooltipProvider delay={300}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-background flex min-w-0 flex-col">
          <AppHeader />
          <main className="flex-1 overflow-x-hidden p-4 pb-20 md:pb-4">
            <Outlet />
          </main>
        </SidebarInset>
        <MobileTabBar />
        <CommandPalette />
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: { toast: "font-sans" },
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  )
}

export type BullViewerRouter = ReturnType<typeof createBullViewerRouter>

declare module "@tanstack/react-router" {
  interface Register {
    router: BullViewerRouter
  }
}
