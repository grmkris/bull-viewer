import {
  createRootRoute,
  createRoute,
  createRouter,
  createBrowserHistory,
  createMemoryHistory,
  Outlet,
} from "@tanstack/react-router";
import type { RouterHistory } from "@tanstack/react-router";
import { z } from "zod";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { JOB_STATES } from "./jobs/filterSchema.ts";
import { JobDetail } from "./pages/JobDetail.tsx";
import { QueueDetail } from "./pages/QueueDetail.tsx";
import { QueueList } from "./pages/QueueList.tsx";
import { AppHeader } from "./shell/AppHeader.tsx";
import { AppSidebar } from "./shell/AppSidebar.tsx";
import { CommandPalette } from "./shell/CommandPalette.tsx";
import { MobileTabBar } from "./shell/MobileTabBar.tsx";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: QueueList,
});

const queueSearchSchema = z.object({
  tab: z.enum(["overview", "jobs"]).optional(),
  states: z.array(z.enum(JOB_STATES)).optional(),
  name: z.string().optional(),
  job: z.string().optional(),
  live: z.boolean().optional(),
  range: z.enum(["15m", "1h", "6h", "24h", "7d"]).optional(),
});

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "queues/$name",
  component: QueueDetail,
  validateSearch: queueSearchSchema,
});

const jobRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "queues/$name/jobs/$id",
  component: JobDetail,
});

const routeTree = rootRoute.addChildren([indexRoute, queueRoute, jobRoute]);

export interface CreateBullViewerRouterOptions {
  basePath?: string;
  history?: "browser" | "memory";
}

export function createBullViewerRouter(
  options: CreateBullViewerRouterOptions = {}
) {
  const basePath = options.basePath ?? "/";
  const history: RouterHistory =
    options.history === "memory"
      ? createMemoryHistory({ initialEntries: ["/"] })
      : createBrowserHistory();

  return createRouter({
    routeTree,
    basepath: basePath,
    history,
    defaultPreload: "intent",
  });
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
          mobileOffset={{ top: 56, bottom: 72 }}
          toastOptions={{
            classNames: { toast: "font-sans" },
          }}
        />
      </SidebarProvider>
    </TooltipProvider>
  );
}

export type BullViewerRouter = ReturnType<typeof createBullViewerRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: BullViewerRouter;
  }
}
