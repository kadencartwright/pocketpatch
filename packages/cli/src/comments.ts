import type { Comment, Project } from "@pocketpatch/storage";

const lineLabel = (comment: Comment): string => {
  if (comment.oldLineNumber !== null && comment.newLineNumber !== null) {
    return `old ${comment.oldLineNumber}, new ${comment.newLineNumber}`;
  }

  if (comment.newLineNumber !== null) {
    return `new ${comment.newLineNumber}`;
  }

  if (comment.oldLineNumber !== null) {
    return `old ${comment.oldLineNumber}`;
  }

  return "file";
};

const indentBody = (body: string): string =>
  body
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

export const formatProjectComments = (
  project: Project,
  comments: ReadonlyArray<Comment>,
): string => {
  if (comments.length === 0) {
    return `No comments for ${project.path} (project ${project.id})\n`;
  }

  const sorted = [...comments].sort(
    (left, right) =>
      left.filePath.localeCompare(right.filePath) ||
      (left.oldLineNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.oldLineNumber ?? Number.MAX_SAFE_INTEGER) ||
      (left.newLineNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.newLineNumber ?? Number.MAX_SAFE_INTEGER) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id - right.id,
  );
  const files = new Map<string, Array<Comment>>();

  for (const comment of sorted) {
    const fileComments = files.get(comment.filePath) ?? [];

    fileComments.push(comment);
    files.set(comment.filePath, fileComments);
  }

  const lines = [
    `PocketPatch comments for ${project.path} (project ${project.id})`,
  ];

  for (const [filePath, fileComments] of files) {
    lines.push("", filePath);

    for (const comment of fileComments) {
      lines.push(`- ${lineLabel(comment)} (comment ${comment.id})`);
      lines.push(indentBody(comment.body));
    }
  }

  lines.push("");

  return lines.join("\n");
};
