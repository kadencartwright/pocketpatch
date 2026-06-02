import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { Context, Effect, Layer, Schema } from "effect";

const execFileAsync = promisify(execFile);

export type GitFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "untracked";

export const GitFileStatusSchema = Schema.Literal(
  "added",
  "deleted",
  "modified",
  "renamed",
  "untracked",
);

export const GitRefSchema = Schema.Struct({
  branch: Schema.NullOr(Schema.String),
  displayName: Schema.String,
  head: Schema.String,
});

export type GitRef = {
  readonly branch: string | null;
  readonly displayName: string;
  readonly head: string;
};

export const ChangedFileSchema = Schema.Struct({
  availability: Schema.Literal("available", "skipped"),
  oldPath: Schema.NullOr(Schema.String),
  path: Schema.String,
  status: GitFileStatusSchema,
});

export type ChangedFile = {
  readonly availability: "available" | "skipped";
  readonly oldPath: string | null;
  readonly path: string;
  readonly status: GitFileStatus;
};

export const DiffLineSchema = Schema.Struct({
  content: Schema.String,
  kind: Schema.Literal("add", "context", "delete"),
  newLineNumber: Schema.NullOr(Schema.Number),
  oldLineNumber: Schema.NullOr(Schema.Number),
});

export type DiffLine = {
  readonly content: string;
  readonly kind: "add" | "context" | "delete";
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
};

export const DiffHunkSchema = Schema.Struct({
  header: Schema.String,
  lines: Schema.Array(DiffLineSchema),
  newLines: Schema.Number,
  newStart: Schema.Number,
  oldLines: Schema.Number,
  oldStart: Schema.Number,
});

export type DiffHunk = {
  readonly header: string;
  readonly lines: ReadonlyArray<DiffLine>;
  readonly newLines: number;
  readonly newStart: number;
  readonly oldLines: number;
  readonly oldStart: number;
};

export const SkippedReasonSchema = Schema.Literal(
  "binary_file",
  "dense_directory",
  "generated_directory",
  "large_file",
  "too_many_files",
);

export type SkippedReason = typeof SkippedReasonSchema.Type;

export const AvailableFileDiffSchema = Schema.Struct({
  availability: Schema.Literal("available"),
  binary: Schema.Boolean,
  hunks: Schema.Array(DiffHunkSchema),
  oldPath: Schema.NullOr(Schema.String),
  path: Schema.String,
  status: GitFileStatusSchema,
});

export const SkippedFileDiffSchema = Schema.Struct({
  availability: Schema.Literal("skipped"),
  byteCount: Schema.optional(Schema.Number),
  fileCount: Schema.optional(Schema.Number),
  oldPath: Schema.NullOr(Schema.String),
  path: Schema.String,
  reason: SkippedReasonSchema,
  status: GitFileStatusSchema,
});

export const FileDiffSchema = Schema.Union(
  AvailableFileDiffSchema,
  SkippedFileDiffSchema,
);

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

export const RepositorySnapshotSchema = Schema.Struct({
  diffs: Schema.Array(FileDiffSchema),
  files: Schema.Array(ChangedFileSchema),
  path: Schema.String,
  ref: GitRefSchema,
});

export type RepositorySnapshot = {
  readonly diffs: ReadonlyArray<FileDiff>;
  readonly files: ReadonlyArray<ChangedFile>;
  readonly path: string;
  readonly ref: GitRef;
};

export type InspectRepositoryOptions = {
  readonly maxFileDiffLines?: number;
  readonly maxUntrackedFileBytes?: number;
  readonly maxUntrackedFilesPerDirectory?: number;
  readonly path: string;
};

const defaultMaxUntrackedFileBytes = 1024 * 1024;
const defaultMaxUntrackedFilesPerDirectory = 500;
const generatedDirectoryRoots = [
  ".cache/",
  ".next/",
  ".pnpm-store/",
  ".turbo/",
  ".yarn/cache/",
  "build/",
  "coverage/",
  "dist/",
  "node_modules/",
] as const;

export class GitCommandError extends Schema.TaggedError<GitCommandError>()(
  "GitCommandError",
  {
    args: Schema.Array(Schema.String),
    cause: Schema.Unknown,
    cwd: Schema.String,
  },
) {
  override get message(): string {
    return `Git command failed: git ${this.args.join(" ")}`;
  }
}

const runGit = (
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<string, GitCommandError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new GitCommandError({
        args: [...args],
        cause,
        cwd,
      }),
    try: async () => {
      const { stdout } = await execFileAsync("git", [...args], {
        cwd,
        maxBuffer: 50 * 1024 * 1024,
      });

      return stdout;
    },
  });

const runGitOption = (cwd: string, args: ReadonlyArray<string>) =>
  runGit(cwd, args).pipe(Effect.option);

const statusFromNameStatus = (status: string): GitFileStatus => {
  switch (status[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
};

export const parseChangedFiles = (
  nameStatus: string,
  untracked: string,
): ReadonlyArray<ChangedFile> => {
  const tracked = nameStatus
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): ChangedFile => {
      const [rawStatus = "", firstPath = "", secondPath] = line.split("\t");
      const status = statusFromNameStatus(rawStatus);

      return status === "renamed"
        ? {
            availability: "available",
            oldPath: firstPath,
            path: secondPath ?? firstPath,
            status,
          }
        : {
            availability: "available",
            oldPath: null,
            path: firstPath,
            status,
          };
    });
  const untrackedFiles = untracked
    .split("\n")
    .filter((path) => path.length > 0)
    .map(
      (path): ChangedFile => ({
        availability: "available",
        oldPath: null,
        path,
        status: "untracked",
      }),
    );

  return [...tracked, ...untrackedFiles].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
};

const hunkPattern =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldLines>\d+))? \+(?<newStart>\d+)(?:,(?<newLines>\d+))? @@(?<header>.*)$/;

const parseHunkHeader = (line: string) => {
  const match = hunkPattern.exec(line);
  if (match?.groups === undefined) {
    return null;
  }

  return {
    header: match.groups.header?.trim() ?? "",
    newLines: Number(match.groups.newLines ?? "1"),
    newStart: Number(match.groups.newStart),
    oldLines: Number(match.groups.oldLines ?? "1"),
    oldStart: Number(match.groups.oldStart),
  };
};

type MutableHunk = Omit<DiffHunk, "lines"> & { lines: Array<DiffLine> };

type MutableFileDiff = ChangedFile & {
  binary: boolean;
  hunks: Array<DiffHunk>;
};

type DiffParserState = {
  current: MutableFileDiff | null;
  currentHunk: MutableHunk | null;
  newLine: number;
  oldLine: number;
  parsed: Array<FileDiff>;
};

const finishHunk = (state: DiffParserState) => {
  if (state.current === null || state.currentHunk === null) {
    return;
  }

  state.current.hunks.push(state.currentHunk);
  state.currentHunk = null;
};

const finishFile = (state: DiffParserState, maxFileDiffLines: number) => {
  if (state.current === null) {
    return;
  }

  finishHunk(state);
  const lineCount = state.current.hunks.reduce(
    (total, hunk) => total + hunk.lines.length,
    0,
  );

  state.parsed.push(
    state.current.binary
      ? {
          availability: "skipped",
          oldPath: state.current.oldPath,
          path: state.current.path,
          reason: "binary_file",
          status: state.current.status,
        }
      : lineCount > maxFileDiffLines
        ? {
            availability: "skipped",
            oldPath: state.current.oldPath,
            path: state.current.path,
            reason: "large_file",
            status: state.current.status,
          }
        : {
            availability: "available",
            binary: false,
            hunks: state.current.hunks,
            oldPath: state.current.oldPath,
            path: state.current.path,
            status: state.current.status,
          },
  );
  state.current = null;
};

const startFile = (
  state: DiffParserState,
  line: string,
  filesByPath: ReadonlyMap<string, ChangedFile>,
  binaryPaths: ReadonlySet<string>,
) => {
  const path = line.slice("diff --git ".length).split(" b/")[1] ?? "";
  const changedFile = filesByPath.get(path);

  state.current =
    changedFile === undefined
      ? null
      : {
          ...changedFile,
          binary: binaryPaths.has(changedFile.path),
          hunks: [],
        };
};

const startHunk = (state: DiffParserState, line: string) => {
  finishHunk(state);
  const header = parseHunkHeader(line);
  if (header === null) {
    return;
  }

  state.currentHunk = {
    ...header,
    lines: [],
  };
  state.oldLine = header.oldStart;
  state.newLine = header.newStart;
};

const appendDiffLine = (state: DiffParserState, line: string) => {
  if (state.currentHunk === null || line.startsWith("\\ No newline")) {
    return;
  }

  if (line.startsWith("+") && !line.startsWith("+++")) {
    state.currentHunk.lines.push({
      content: line.slice(1),
      kind: "add",
      newLineNumber: state.newLine,
      oldLineNumber: null,
    });
    state.newLine += 1;
    return;
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    state.currentHunk.lines.push({
      content: line.slice(1),
      kind: "delete",
      newLineNumber: null,
      oldLineNumber: state.oldLine,
    });
    state.oldLine += 1;
    return;
  }

  if (line.startsWith(" ")) {
    state.currentHunk.lines.push({
      content: line.slice(1),
      kind: "context",
      newLineNumber: state.newLine,
      oldLineNumber: state.oldLine,
    });
    state.oldLine += 1;
    state.newLine += 1;
  }
};

export const parseUnifiedDiff = (
  diff: string,
  files: ReadonlyArray<ChangedFile>,
  maxFileDiffLines: number,
  binaryPaths: ReadonlySet<string> = new Set(),
): ReadonlyArray<FileDiff> => {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const state: DiffParserState = {
    current: null,
    currentHunk: null,
    newLine: 0,
    oldLine: 0,
    parsed: [],
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      finishFile(state, maxFileDiffLines);
      startFile(state, line, filesByPath, binaryPaths);
      continue;
    }

    if (state.current === null) {
      continue;
    }

    if (line.startsWith("Binary files ")) {
      state.current.binary = true;
      continue;
    }

    if (line.startsWith("@@ ")) {
      startHunk(state, line);
      continue;
    }

    appendDiffLine(state, line);
  }

  finishFile(state, maxFileDiffLines);

  return state.parsed;
};

export const parseBinaryPaths = (numstat: string): ReadonlySet<string> =>
  new Set(
    numstat
      .split("\n")
      .filter((line) => line.startsWith("-\t-\t"))
      .map((line) => {
        const [, , path] = line.split("\t");

        return path ?? "";
      })
      .filter((path) => path.length > 0),
  );

const isBinaryBuffer = (buffer: Buffer): boolean => buffer.includes(0);

const makeUntrackedDiff = (
  file: ChangedFile,
  contents: string,
  maxFileDiffLines: number,
): FileDiff => {
  const lines = contents.endsWith("\n")
    ? contents.slice(0, -1).split("\n")
    : contents.split("\n");
  if (lines.length > maxFileDiffLines) {
    return {
      availability: "skipped",
      oldPath: file.oldPath,
      path: file.path,
      reason: "large_file",
      status: file.status,
    };
  }

  const hunk: DiffHunk = {
    header: "",
    lines: lines.map((content, index) => ({
      content,
      kind: "add",
      newLineNumber: index + 1,
      oldLineNumber: null,
    })),
    newLines: lines.length,
    newStart: 1,
    oldLines: 0,
    oldStart: 0,
  };

  return {
    availability: "available",
    binary: false,
    hunks: [hunk],
    oldPath: file.oldPath,
    path: file.path,
    status: file.status,
  };
};

const inspectUntrackedFile = (
  repoPath: string,
  file: ChangedFile,
  maxFileDiffLines: number,
  maxUntrackedFileBytes: number,
): Effect.Effect<FileDiff, GitCommandError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new GitCommandError({
        args: ["read-untracked", file.path],
        cause,
        cwd: repoPath,
      }),
    try: async () => {
      const fileStat = await stat(join(repoPath, file.path));

      if (fileStat.size > maxUntrackedFileBytes) {
        return {
          availability: "skipped",
          byteCount: fileStat.size,
          oldPath: file.oldPath,
          path: file.path,
          reason: "large_file",
          status: file.status,
        };
      }

      const buffer = await readFile(join(repoPath, file.path));

      return isBinaryBuffer(buffer)
        ? {
            availability: "skipped",
            oldPath: file.oldPath,
            path: file.path,
            reason: "binary_file",
            status: file.status,
          }
        : makeUntrackedDiff(file, buffer.toString("utf8"), maxFileDiffLines);
    },
  });

const generatedDirectoryRootForPath = (path: string): string | null => {
  for (const root of generatedDirectoryRoots) {
    if (path === root.slice(0, -1) || path.startsWith(root)) {
      return root;
    }
  }

  return null;
};

const directoryForPath = (path: string): string => {
  const directory = dirname(path);

  return directory === "." ? "" : `${directory}/`;
};

const directoriesForPath = (path: string): ReadonlyArray<string> => {
  const directory = directoryForPath(path);

  if (directory === "") {
    return [];
  }

  const parts = directory.replace(/\/$/, "").split("/");

  return parts.map((_, index) => `${parts.slice(0, index + 1).join("/")}/`);
};

const skippedGroup = ({
  fileCount,
  path,
  reason,
}: {
  readonly fileCount: number;
  readonly path: string;
  readonly reason: Extract<
    SkippedReason,
    "dense_directory" | "generated_directory" | "too_many_files"
  >;
}): SkippedFileDiff => ({
  availability: "skipped",
  fileCount,
  oldPath: null,
  path,
  reason,
  status: "untracked",
});

const incrementCount = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const skippedGroupsFromCounts = (
  counts: ReadonlyMap<string, number>,
  reason: Extract<
    SkippedReason,
    "dense_directory" | "generated_directory" | "too_many_files"
  >,
): ReadonlyArray<SkippedFileDiff> =>
  [...counts.entries()].map(([path, fileCount]) =>
    skippedGroup({
      fileCount,
      path,
      reason,
    }),
  );

const splitGeneratedUntrackedFiles = (
  files: ReadonlyArray<ChangedFile>,
): {
  readonly generated: ReadonlyMap<string, number>;
  readonly nonGenerated: ReadonlyArray<ChangedFile>;
} => {
  const generated = new Map<string, number>();
  const nonGenerated: Array<ChangedFile> = [];

  for (const file of files) {
    const generatedRoot = generatedDirectoryRootForPath(file.path);

    if (generatedRoot === null) {
      nonGenerated.push(file);
    } else {
      incrementCount(generated, generatedRoot);
    }
  }

  return { generated, nonGenerated };
};

const countUntrackedDirectoryAncestors = (
  files: ReadonlyArray<ChangedFile>,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();

  for (const file of files) {
    for (const directory of directoriesForPath(file.path)) {
      incrementCount(counts, directory);
    }
  }

  return counts;
};

const denseDirectoryForFile = (
  file: ChangedFile,
  directoryCounts: ReadonlyMap<string, number>,
  maxUntrackedFilesPerDirectory: number,
): string | undefined =>
  directoriesForPath(file.path)
    .toReversed()
    .find(
      (directory) =>
        (directoryCounts.get(directory) ?? 0) > maxUntrackedFilesPerDirectory,
    );

const splitDenseUntrackedFiles = (
  files: ReadonlyArray<ChangedFile>,
  maxUntrackedFilesPerDirectory: number,
): {
  readonly dense: ReadonlyMap<string, number>;
  readonly inspectable: ReadonlyArray<ChangedFile>;
} => {
  const directoryCounts = countUntrackedDirectoryAncestors(files);
  const dense = new Map<string, number>();
  const inspectable: Array<ChangedFile> = [];

  for (const file of files) {
    const denseDirectory = denseDirectoryForFile(
      file,
      directoryCounts,
      maxUntrackedFilesPerDirectory,
    );

    if (denseDirectory === undefined) {
      inspectable.push(file);
    } else {
      incrementCount(dense, denseDirectory);
    }
  }

  return { dense, inspectable };
};

const partitionUntrackedFiles = (
  files: ReadonlyArray<ChangedFile>,
  maxUntrackedFilesPerDirectory: number,
): {
  readonly inspectable: ReadonlyArray<ChangedFile>;
  readonly skipped: ReadonlyArray<SkippedFileDiff>;
} => {
  const generatedSplit = splitGeneratedUntrackedFiles(files);
  const denseSplit = splitDenseUntrackedFiles(
    generatedSplit.nonGenerated,
    maxUntrackedFilesPerDirectory,
  );

  return {
    inspectable: denseSplit.inspectable,
    skipped: [
      ...skippedGroupsFromCounts(
        generatedSplit.generated,
        "generated_directory",
      ),
      ...skippedGroupsFromCounts(denseSplit.dense, "dense_directory"),
    ],
  };
};

export const inspectRepository = ({
  maxFileDiffLines = 5_000,
  maxUntrackedFileBytes = defaultMaxUntrackedFileBytes,
  maxUntrackedFilesPerDirectory = defaultMaxUntrackedFilesPerDirectory,
  path,
}: InspectRepositoryOptions): Effect.Effect<
  RepositorySnapshot,
  GitCommandError
> =>
  Effect.gen(function* () {
    const branch = yield* runGitOption(path, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ]);
    const head = (yield* runGit(path, ["rev-parse", "HEAD"])).trim();
    const nameStatus = yield* runGit(path, [
      "diff",
      "--name-status",
      "--find-renames",
      "HEAD",
      "--",
    ]);
    const untracked = yield* runGit(path, [
      "ls-files",
      "--others",
      "--exclude-standard",
    ]);
    const binaryPaths = parseBinaryPaths(
      yield* runGit(path, [
        "diff",
        "--numstat",
        "--find-renames",
        "HEAD",
        "--",
      ]),
    );
    const files = parseChangedFiles(nameStatus, untracked);
    const trackedFiles = files.filter((file) => file.status !== "untracked");
    const untrackedFiles = partitionUntrackedFiles(
      files.filter((file) => file.status === "untracked"),
      maxUntrackedFilesPerDirectory,
    );
    const trackedDiff =
      trackedFiles.length === 0
        ? []
        : parseUnifiedDiff(
            yield* runGit(path, [
              "diff",
              "--no-ext-diff",
              "--find-renames",
              "--binary",
              "HEAD",
              "--",
            ]),
            trackedFiles,
            maxFileDiffLines,
            binaryPaths,
          );
    const untrackedDiffs = yield* Effect.forEach(
      untrackedFiles.inspectable,
      (file) =>
        inspectUntrackedFile(
          path,
          file,
          maxFileDiffLines,
          maxUntrackedFileBytes,
        ),
    );
    const branchName = branch._tag === "Some" ? branch.value.trim() : null;
    const diffs = [
      ...trackedDiff,
      ...untrackedDiffs,
      ...untrackedFiles.skipped,
    ].sort((left, right) => left.path.localeCompare(right.path));

    return {
      diffs,
      files: diffs.map(({ availability, oldPath, path, status }) => ({
        availability,
        oldPath,
        path,
        status,
      })),
      path,
      ref: {
        branch: branchName,
        displayName: branchName ?? head.slice(0, 12),
        head,
      },
    };
  });

export class GitService extends Context.Tag("@pocketpatch/git/GitService")<
  GitService,
  {
    readonly inspectRepository: typeof inspectRepository;
  }
>() {}

export const GitServiceLive = Layer.succeed(GitService, {
  inspectRepository,
});
