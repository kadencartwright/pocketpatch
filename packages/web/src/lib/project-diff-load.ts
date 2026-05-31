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

export type ProjectCommentState = ProjectComment & {
  readonly lineKey: string;
  readonly stale: boolean;
};

export type ProjectDiffPageData = {
  readonly comments: ReadonlyArray<ProjectCommentState>;
  readonly commentsByLine: Record<string, ReadonlyArray<ProjectCommentState>>;
  readonly diff: ProjectDiffResponse;
  readonly highlightedDiff: HighlightedProjectDiff;
  readonly resolvedComments: ReadonlyArray<ProjectCommentState>;
  readonly summary: DiffViewModel;
  readonly unresolvedComments: ReadonlyArray<ProjectCommentState>;
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
  comments: ReadonlyArray<ProjectCommentState>,
): Record<string, ReadonlyArray<ProjectCommentState>> =>
  Object.groupBy(comments, commentLineKey) as Record<
    string,
    ReadonlyArray<ProjectCommentState>
  >;

const diffLineKey = (
  filePath: string,
  line: {
    readonly newLineNumber: number | null;
    readonly oldLineNumber: number | null;
  },
) =>
  commentLineKey({
    filePath,
    newLineNumber: line.newLineNumber,
    oldLineNumber: line.oldLineNumber,
  });

const buildCurrentLineContentByKey = (
  diff: ProjectDiffResponse,
): Map<string, string> => {
  const lines = new Map<string, string>();

  for (const file of diff.diffs) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        lines.set(diffLineKey(file.path, line), line.content);
      }
    }
  }

  return lines;
};

export const addCommentState = (
  diff: ProjectDiffResponse,
  comments: ReadonlyArray<ProjectComment>,
): ReadonlyArray<ProjectCommentState> => {
  const currentLines = buildCurrentLineContentByKey(diff);

  return comments.map((comment) => {
    const key = commentLineKey(comment);
    const currentContent = currentLines.get(key);
    const stale =
      currentContent === undefined ||
      (comment.anchorLineContent !== null &&
        currentContent !== comment.anchorLineContent);

    return {
      ...comment,
      lineKey: key,
      stale,
    };
  });
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
  const comments = await fetchProjectComments({
    daemonBaseUrl,
    fetch,
    projectId,
    showResolved: true,
  });
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
