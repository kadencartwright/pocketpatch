import { commentLineKey } from "./comment-anchor";

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
  const lineParts = [
    oldLineNumber === null ? null : `old ${oldLineNumber}`,
    newLineNumber === null ? null : `new ${newLineNumber}`,
  ].filter((part): part is string => part !== null);

  return lineParts.length === 0 ? "file" : lineParts.join(", ");
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
