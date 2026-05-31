import {
  createDiffViewModel,
  type DiffViewModel,
  fetchProjectComments,
  fetchProjectDiff,
  type ProjectComment,
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
  readonly comments: ReadonlyArray<ProjectComment>;
  readonly commentsByLine: Record<string, ReadonlyArray<ProjectComment>>;
  readonly diff: ProjectDiffResponse;
  readonly highlightedDiff: HighlightedProjectDiff;
  readonly summary: DiffViewModel;
};

export const commentLineKey = ({
  filePath,
  newLineNumber,
  oldLineNumber,
}: Pick<ProjectComment, "filePath" | "newLineNumber" | "oldLineNumber">) => {
  if (newLineNumber !== null) {
    return `${filePath}:new:${newLineNumber}`;
  }

  if (oldLineNumber !== null) {
    return `${filePath}:old:${oldLineNumber}`;
  }

  return `${filePath}:file`;
};

export const groupCommentsByLine = (
  comments: ReadonlyArray<ProjectComment>,
): Record<string, ReadonlyArray<ProjectComment>> =>
  Object.groupBy(comments, commentLineKey) as Record<
    string,
    ReadonlyArray<ProjectComment>
  >;

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
  const comments = await fetchProjectComments({
    daemonBaseUrl,
    fetch,
    projectId,
  });

  return {
    comments: comments.comments,
    commentsByLine: groupCommentsByLine(comments.comments),
    diff,
    highlightedDiff: await highlightProjectDiff(diff),
    summary: createDiffViewModel(diff),
  };
};
