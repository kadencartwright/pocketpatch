import type {
  DiffLine,
  ProjectComment,
  ProjectDiffResponse,
} from "./diff-client";

export type ProjectCommentAnchorState = ProjectComment & {
  readonly lineKey: string;
};

type CurrentDiffLine = DiffLine & {
  readonly filePath: string;
  readonly lineKey: string;
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

const buildCurrentDiffLines = (
  diff: ProjectDiffResponse,
): ReadonlyArray<CurrentDiffLine> => {
  const lines: Array<CurrentDiffLine> = [];

  for (const file of diff.diffs) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        lines.push({
          ...line,
          filePath: file.path,
          lineKey: diffLineKey(file.path, line),
        });
      }
    }
  }

  return lines;
};

const lineNumberDistance = (
  comment: ProjectComment,
  line: CurrentDiffLine,
): number => {
  if (comment.newLineNumber !== null && line.newLineNumber !== null) {
    return Math.abs(comment.newLineNumber - line.newLineNumber);
  }

  if (comment.oldLineNumber !== null && line.oldLineNumber !== null) {
    return Math.abs(comment.oldLineNumber - line.oldLineNumber);
  }

  return Number.MAX_SAFE_INTEGER;
};

const canUseLineSide = (
  comment: ProjectComment,
  line: CurrentDiffLine,
): boolean => {
  if (comment.newLineNumber !== null) {
    return line.newLineNumber !== null;
  }

  if (comment.oldLineNumber !== null) {
    return line.oldLineNumber !== null;
  }

  return false;
};

const rankLineCandidate = (
  comment: ProjectComment,
  line: CurrentDiffLine,
): number => {
  const sidePenalty = canUseLineSide(comment, line) ? 0 : 1_000_000;

  return sidePenalty + lineNumberDistance(comment, line);
};

const findCurrentAnchorLine = (
  comment: ProjectComment,
  currentLines: ReadonlyArray<CurrentDiffLine>,
  currentLinesByKey: ReadonlyMap<string, CurrentDiffLine>,
): CurrentDiffLine | null => {
  const originalLineKey = commentLineKey(comment);
  const originalLine = currentLinesByKey.get(originalLineKey);

  if (
    originalLine !== undefined &&
    (comment.anchorLineContent === null ||
      originalLine.content === comment.anchorLineContent)
  ) {
    return originalLine;
  }

  if (comment.anchorLineContent === null) {
    return null;
  }

  const candidates = currentLines
    .filter(
      (line) =>
        line.filePath === comment.filePath &&
        line.content === comment.anchorLineContent,
    )
    .toSorted(
      (left, right) =>
        rankLineCandidate(comment, left) - rankLineCandidate(comment, right),
    );

  return candidates[0] ?? null;
};

export const attachCommentsToCurrentDiff = (
  diff: ProjectDiffResponse,
  comments: ReadonlyArray<ProjectComment>,
): ReadonlyArray<ProjectCommentAnchorState> => {
  const currentLines = buildCurrentDiffLines(diff);
  const currentLinesByKey = new Map(
    currentLines.map((line) => [line.lineKey, line]),
  );
  const changedFilePaths = new Set(diff.files.map((file) => file.path));
  const anchoredComments: Array<ProjectCommentAnchorState> = [];

  for (const comment of comments) {
    if (!changedFilePaths.has(comment.filePath)) {
      continue;
    }

    if (comment.newLineNumber === null && comment.oldLineNumber === null) {
      anchoredComments.push({
        ...comment,
        lineKey: commentLineKey(comment),
      });
      continue;
    }

    const currentLine = findCurrentAnchorLine(
      comment,
      currentLines,
      currentLinesByKey,
    );

    if (currentLine === null) {
      continue;
    }

    anchoredComments.push({
      ...comment,
      lineKey: currentLine.lineKey,
      newLineNumber: currentLine.newLineNumber,
      oldLineNumber: currentLine.oldLineNumber,
    });
  }

  return anchoredComments;
};
