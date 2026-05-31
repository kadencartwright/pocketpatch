import { useParams } from "@tanstack/react-router";
import { DiffPage } from "../components/diff-page";
import { useProjectDiffPageQuery } from "../lib/project-diff-query";

export const ProjectDiffRoute = () => {
  const { projectId } = useParams({
    from: "/projects/$projectId/diff",
  });
  const query = useProjectDiffPageQuery(projectId);

  if (query.isPending) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#282c34] p-6 text-[#abb2bf]">
        <p className="m-0 text-[#7f848e] text-sm">Loading diff&hellip;</p>
      </main>
    );
  }

  if (query.isError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#282c34] p-6 text-[#abb2bf]">
        <div className="grid max-w-md gap-2 rounded-md border border-[#3e4451] bg-[#21252b] p-4">
          <h1 className="m-0 font-bold text-base">Unable to load diff</h1>
          <p className="m-0 text-[#7f848e] text-sm">
            {query.error instanceof Error
              ? query.error.message
              : "Unknown error"}
          </p>
        </div>
      </main>
    );
  }

  return <DiffPage data={query.data} projectId={projectId} />;
};
