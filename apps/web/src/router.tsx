import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
} from "@tanstack/react-router";
import { ProjectDiffRoute } from "./routes/project-diff-route";

const rootRoute = createRootRoute({
  component: Outlet,
});

const indexRoute = createRoute({
  component: () => (
    <main className="grid min-h-screen place-items-center bg-[#282c34] p-6 text-[#abb2bf]">
      <p className="m-0 text-center text-[#7f848e] text-sm">
        Open a PocketPatch project review URL.
      </p>
    </main>
  ),
  getParentRoute: () => rootRoute,
  path: "/",
});

const projectRoute = createRoute({
  component: () => {
    const { projectId } = projectRoute.useParams();

    return <Navigate params={{ projectId }} to="/projects/$projectId/diff" />;
  },
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
});

const projectDiffRoute = createRoute({
  component: ProjectDiffRoute,
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/diff",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute,
  projectDiffRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
