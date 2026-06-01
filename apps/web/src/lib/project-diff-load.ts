import {
  attachCommentsToCurrentDiff,
  type ProjectCommentAnchorState,
} from "./comment-anchor";
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

export type ProjectCommentState = ProjectCommentAnchorState;

export type ProjectDiffPageData = {
  readonly comments: ReadonlyArray<ProjectCommentState>;
  readonly commentsByLine: Record<string, ReadonlyArray<ProjectCommentState>>;
  readonly diff: ProjectDiffResponse;
  readonly highlightedDiff: HighlightedProjectDiff;
  readonly resolvedComments: ReadonlyArray<ProjectCommentState>;
  readonly summary: DiffViewModel;
  readonly unresolvedComments: ReadonlyArray<ProjectCommentState>;
};

const groupCommentsByLine = (
  comments: ReadonlyArray<ProjectCommentState>,
): Record<string, ReadonlyArray<ProjectCommentState>> =>
  comments.reduce<Record<string, Array<ProjectCommentState>>>(
    (groups, comment) => {
      const key = comment.lineKey;

      groups[key] ??= [];
      groups[key].push(comment);

      return groups;
    },
    {},
  );

const addCommentState = (
  diff: ProjectDiffResponse,
  comments: ReadonlyArray<ProjectComment>,
): ReadonlyArray<ProjectCommentState> =>
  attachCommentsToCurrentDiff(diff, comments);

export const loadProjectDiff = async ({
  daemonBaseUrl,
  fetch,
  projectId,
}: LoadProjectDiffOptions): Promise<ProjectDiffPageData> => {
  const [diff, comments] = await Promise.all([
    fetchProjectDiff({
      daemonBaseUrl,
      fetch,
      projectId,
    }),
    fetchProjectComments({
      daemonBaseUrl,
      fetch,
      projectId,
      showResolved: true,
    }),
  ]);
  const commentStates = addCommentState(diff, comments.comments);
  const unresolvedComments = commentStates.filter(
    (comment) => comment.resolvedAt === null,
  );
  const resolvedComments = commentStates.filter(
    (comment) => comment.resolvedAt !== null,
  );

  return {
    comments: commentStates,
    commentsByLine: groupCommentsByLine(unresolvedComments),
    diff,
    highlightedDiff: await highlightProjectDiff(diff),
    resolvedComments,
    summary: createDiffViewModel(diff),
    unresolvedComments,
  };
};
