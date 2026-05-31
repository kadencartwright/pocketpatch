import { commentLineKey } from "./project-diff-load";

export type CommentDrawerLine = {
  readonly content: string;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
};

export type CommentDrawerTarget = {
  readonly anchorLineContent: string;
  readonly filePath: string;
  readonly key: string;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
};

export const buildCommentDrawerTarget = ({
  filePath,
  line,
}: {
  readonly filePath: string;
  readonly line: CommentDrawerLine;
}): CommentDrawerTarget => ({
  anchorLineContent: line.content,
  filePath,
  key: commentLineKey({
    filePath,
    newLineNumber: line.newLineNumber,
    oldLineNumber: line.oldLineNumber,
  }),
  newLineNumber: line.newLineNumber,
  oldLineNumber: line.oldLineNumber,
});

export const commentDrawerLineLabel = ({
  newLineNumber,
  oldLineNumber,
}: Pick<CommentDrawerTarget, "newLineNumber" | "oldLineNumber">): string => {
  if (oldLineNumber !== null && newLineNumber !== null) {
    return `old ${oldLineNumber}, new ${newLineNumber}`;
  }

  if (newLineNumber !== null) {
    return `new ${newLineNumber}`;
  }

  if (oldLineNumber !== null) {
    return `old ${oldLineNumber}`;
  }

  return "file";
};

export const commentDrawerCompactLabel = ({
  filePath,
  newLineNumber,
  oldLineNumber,
}: Pick<
  CommentDrawerTarget,
  "filePath" | "newLineNumber" | "oldLineNumber"
>): string => {
  const fileName = filePath.split("/").at(-1) ?? filePath;
  const lineNumber = newLineNumber ?? oldLineNumber;

  return lineNumber === null ? fileName : `${fileName}:${lineNumber}`;
};

export const lineNumberFormValue = (lineNumber: number | null): string =>
  lineNumber === null ? "" : String(lineNumber);
