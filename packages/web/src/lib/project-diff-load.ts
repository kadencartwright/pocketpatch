import {
  createDiffViewModel,
  type DiffViewModel,
  fetchProjectDiff,
  type ProjectDiffResponse,
} from "./diff-client";
import {
  type HighlightedProjectDiff,
  highlightProjectDiff,
} from "./syntax-highlight";

export type LoadProjectDiffOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly projectId: string;
};

export type ProjectDiffPageData = {
  readonly diff: ProjectDiffResponse;
  readonly highlightedDiff: HighlightedProjectDiff;
  readonly summary: DiffViewModel;
};

export const loadProjectDiff = async ({
  daemonBaseUrl,
  fetch,
  projectId,
}: LoadProjectDiffOptions): Promise<ProjectDiffPageData> => {
  const diff = await fetchProjectDiff({
    daemonBaseUrl,
    fetch,
    projectId,
  });

  return {
    diff,
    highlightedDiff: await highlightProjectDiff(diff),
    summary: createDiffViewModel(diff),
  };
};
