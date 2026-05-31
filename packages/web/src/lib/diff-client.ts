export type GitFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "untracked";

export type ProjectDiffResponse = {
  readonly diffs: ReadonlyArray<FileDiff>;
  readonly files: ReadonlyArray<ChangedFile>;
  readonly project: Project;
  readonly ref: GitRef;
};

export type Project = {
  readonly createdAt: string;
  readonly id: number;
  readonly lastSeenAt: string;
  readonly path: string;
};

export type GitRef = {
  readonly branch: string | null;
  readonly displayName: string;
  readonly head: string;
};

export type ChangedFile = {
  readonly oldPath: string | null;
  readonly path: string;
  readonly status: GitFileStatus;
};

export type DiffLine = {
  readonly content: string;
  readonly kind: "add" | "context" | "delete";
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
};

export type DiffHunk = {
  readonly header: string;
  readonly lines: ReadonlyArray<DiffLine>;
  readonly newLines: number;
  readonly newStart: number;
  readonly oldLines: number;
  readonly oldStart: number;
};

export type FileDiff = ChangedFile & {
  readonly binary: boolean;
  readonly hunks: ReadonlyArray<DiffHunk>;
  readonly truncated: boolean;
};

export type DiffViewModel = {
  readonly binaryCount: number;
  readonly changedFileCount: number;
  readonly displayRef: string;
  readonly lineCount: number;
  readonly projectPath: string;
};

export type FetchProjectDiffOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly projectId: string;
};

export const buildProjectDiffUrl = (
  daemonBaseUrl: string,
  projectId: string,
): string => new URL(`/projects/${projectId}/diff`, daemonBaseUrl).toString();

export const fetchProjectDiff = async ({
  daemonBaseUrl,
  fetch,
  projectId,
}: FetchProjectDiffOptions): Promise<ProjectDiffResponse> => {
  const response = await fetch(buildProjectDiffUrl(daemonBaseUrl, projectId));

  if (!response.ok) {
    throw new Error(`Failed to load project diff: ${response.status}`);
  }

  return (await response.json()) as ProjectDiffResponse;
};

export const createDiffViewModel = (
  diff: ProjectDiffResponse,
): DiffViewModel => ({
  binaryCount: diff.diffs.filter((file) => file.binary).length,
  changedFileCount: diff.files.length,
  displayRef: diff.ref.displayName,
  lineCount: diff.diffs.reduce(
    (total, file) =>
      total +
      file.hunks.reduce((hunkTotal, hunk) => hunkTotal + hunk.lines.length, 0),
    0,
  ),
  projectPath: diff.project.path,
});
