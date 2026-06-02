export type GitFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "untracked";

export type ProjectDiffResponse = {
  readonly diffs: ReadonlyArray<FileDiff>;
  readonly files: ReadonlyArray<DiffFileSummary>;
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
  readonly availability: "available" | "skipped";
  readonly oldPath: string | null;
  readonly path: string;
  readonly status: GitFileStatus;
};

export type SkippedReason =
  | "binary_file"
  | "dense_directory"
  | "generated_directory"
  | "large_file"
  | "too_many_files";

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

export type AvailableFileDiff = ChangedFile & {
  readonly availability: "available";
  readonly binary: boolean;
  readonly hunks: ReadonlyArray<DiffHunk>;
};

export type SkippedFileDiff = ChangedFile & {
  readonly availability: "skipped";
  readonly byteCount?: number;
  readonly fileCount?: number;
  readonly reason: SkippedReason;
};

export type FileDiff = AvailableFileDiff | SkippedFileDiff;
export type DiffFileSummary = ChangedFile & {
  readonly availability: "available" | "skipped";
};

export type ProjectComment = {
  readonly anchorLineContent: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly filePath: string;
  readonly id: number;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
  readonly projectId: number;
  readonly resolvedAt: string | null;
};

export type CreateProjectCommentInput = {
  readonly anchorLineContent: string | null;
  readonly body: string;
  readonly filePath: string;
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
};

export type ProjectCommentsResponse = {
  readonly comments: ReadonlyArray<ProjectComment>;
};

export type ProjectCommentResponse = {
  readonly comment: ProjectComment;
};

export type DiffViewModel = {
  readonly binaryCount: number;
  readonly changedFileCount: number;
  readonly displayRef: string;
  readonly lineCount: number;
  readonly projectPath: string;
  readonly skippedCount: number;
};

export type FetchProjectDiffOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly projectId: string;
  readonly timeoutMs?: number;
};

export type ProjectCommentsOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly projectId: string;
  readonly showResolved?: boolean;
};

export type CreateProjectCommentOptions = ProjectCommentsOptions & {
  readonly comment: CreateProjectCommentInput;
};

export type ResolveProjectCommentOptions = ProjectCommentsOptions & {
  readonly commentId: number;
};

const buildUrl = (path: string, daemonBaseUrl: string): string => {
  const base =
    daemonBaseUrl.startsWith("http://") || daemonBaseUrl.startsWith("https://")
      ? daemonBaseUrl
      : globalThis.location.origin;

  const url = new URL(path, base);

  if (!daemonBaseUrl.startsWith("http")) {
    url.pathname = `${daemonBaseUrl.replace(/\/$/, "")}${path}`;
  }

  return url.toString();
};

const buildProjectDiffUrl = (
  daemonBaseUrl: string,
  projectId: string,
): string => buildUrl(`/projects/${projectId}/diff`, daemonBaseUrl);

const buildProjectCommentsUrl = (
  daemonBaseUrl: string,
  projectId: string,
  options: Pick<ProjectCommentsOptions, "showResolved"> = {},
): string => {
  const url = new URL(
    buildUrl(`/projects/${projectId}/comments`, daemonBaseUrl),
  );

  if (options.showResolved === true) {
    url.searchParams.set("showResolved", "true");
  }

  return url.toString();
};

const buildResolveProjectCommentUrl = (
  daemonBaseUrl: string,
  projectId: string,
  commentId: number,
): string =>
  buildUrl(
    `/projects/${projectId}/comments/${commentId}/resolve`,
    daemonBaseUrl,
  );

export const fetchProjectDiff = async ({
  daemonBaseUrl,
  fetch,
  projectId,
  timeoutMs = 15_000,
}: FetchProjectDiffOptions): Promise<ProjectDiffResponse> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(buildProjectDiffUrl(daemonBaseUrl, projectId), {
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Timed out loading project diff");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to load project diff: ${response.status}`);
  }

  return (await response.json()) as ProjectDiffResponse;
};

export const fetchProjectComments = async ({
  daemonBaseUrl,
  fetch,
  projectId,
  showResolved,
}: ProjectCommentsOptions): Promise<ProjectCommentsResponse> => {
  const response = await fetch(
    buildProjectCommentsUrl(
      daemonBaseUrl,
      projectId,
      showResolved === undefined ? {} : { showResolved },
    ),
  );

  if (!response.ok) {
    throw new Error(`Failed to load project comments: ${response.status}`);
  }

  return (await response.json()) as ProjectCommentsResponse;
};

export const resolveProjectComment = async ({
  commentId,
  daemonBaseUrl,
  fetch,
  projectId,
}: ResolveProjectCommentOptions): Promise<ProjectCommentResponse> => {
  const response = await fetch(
    buildResolveProjectCommentUrl(daemonBaseUrl, projectId, commentId),
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to resolve project comment: ${response.status}`);
  }

  return (await response.json()) as ProjectCommentResponse;
};

export const createProjectComment = async ({
  comment,
  daemonBaseUrl,
  fetch,
  projectId,
}: CreateProjectCommentOptions): Promise<ProjectCommentResponse> => {
  const response = await fetch(
    buildProjectCommentsUrl(daemonBaseUrl, projectId),
    {
      body: JSON.stringify(comment),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create project comment: ${response.status}`);
  }

  return (await response.json()) as ProjectCommentResponse;
};

export const createDiffViewModel = (
  diff: ProjectDiffResponse,
): DiffViewModel => ({
  binaryCount: diff.diffs.filter(
    (file) =>
      (file.availability === "available" && file.binary) ||
      (file.availability === "skipped" && file.reason === "binary_file"),
  ).length,
  changedFileCount: diff.files.length,
  displayRef: diff.ref.displayName,
  lineCount: diff.diffs.reduce(
    (total, file) =>
      file.availability === "available"
        ? total +
          file.hunks.reduce(
            (hunkTotal, hunk) => hunkTotal + hunk.lines.length,
            0,
          )
        : total,
    0,
  ),
  projectPath: diff.project.path,
  skippedCount: diff.diffs.filter((file) => file.availability === "skipped")
    .length,
});
