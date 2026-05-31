import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect, Schema } from "effect";

const execFileAsync = promisify(execFile);

export type GitFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "untracked";

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

export type RepositorySnapshot = {
  readonly diffs: ReadonlyArray<FileDiff>;
  readonly files: ReadonlyArray<ChangedFile>;
  readonly path: string;
  readonly ref: GitRef;
};

export type InspectRepositoryOptions = {
  readonly maxFileDiffLines?: number;
  readonly path: string;
};

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
            oldPath: firstPath,
            path: secondPath ?? firstPath,
            status,
          }
        : {
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

const truncateHunks = (
  hunks: ReadonlyArray<DiffHunk>,
  maxFileDiffLines: number,
) => {
  let remaining = maxFileDiffLines;
  let truncated = false;
  const nextHunks: Array<DiffHunk> = [];

  for (const hunk of hunks) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    if (hunk.lines.length <= remaining) {
      nextHunks.push(hunk);
      remaining -= hunk.lines.length;
      continue;
    }

    nextHunks.push({
      ...hunk,
      lines: hunk.lines.slice(0, remaining),
    });
    truncated = true;
    remaining = 0;
  }

  return {
    hunks: nextHunks,
    truncated,
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
  const truncated = truncateHunks(state.current.hunks, maxFileDiffLines);

  state.parsed.push({
    binary: state.current.binary,
    hunks: truncated.hunks,
    oldPath: state.current.oldPath,
    path: state.current.path,
    status: state.current.status,
    truncated: truncated.truncated,
  });
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
  const truncated = truncateHunks([hunk], maxFileDiffLines);

  return {
    binary: false,
    hunks: truncated.hunks,
    oldPath: file.oldPath,
    path: file.path,
    status: file.status,
    truncated: truncated.truncated,
  };
};

const inspectUntrackedFile = (
  repoPath: string,
  file: ChangedFile,
  maxFileDiffLines: number,
): Effect.Effect<FileDiff, GitCommandError> =>
  Effect.tryPromise({
    catch: (cause) =>
      new GitCommandError({
        args: ["read-untracked", file.path],
        cause,
        cwd: repoPath,
      }),
    try: async () => {
      const buffer = await readFile(join(repoPath, file.path));

      return isBinaryBuffer(buffer)
        ? {
            binary: true,
            hunks: [],
            oldPath: file.oldPath,
            path: file.path,
            status: file.status,
            truncated: false,
          }
        : makeUntrackedDiff(file, buffer.toString("utf8"), maxFileDiffLines);
    },
  });

export const inspectRepository = ({
  maxFileDiffLines = 5_000,
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
    const untrackedFiles = files.filter((file) => file.status === "untracked");
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
    const untrackedDiffs = yield* Effect.forEach(untrackedFiles, (file) =>
      inspectUntrackedFile(path, file, maxFileDiffLines),
    );
    const branchName = branch._tag === "Some" ? branch.value.trim() : null;

    return {
      diffs: [...trackedDiff, ...untrackedDiffs].sort((left, right) =>
        left.path.localeCompare(right.path),
      ),
      files,
      path,
      ref: {
        branch: branchName,
        displayName: branchName ?? head.slice(0, 12),
        head,
      },
    };
  });
