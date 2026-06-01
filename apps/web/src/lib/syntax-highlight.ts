import { type BundledLanguage, bundledLanguages, codeToTokens } from "shiki";
import type {
  DiffHunk,
  DiffLine,
  FileDiff,
  ProjectDiffResponse,
} from "./diff-client";

export type SyntaxToken = {
  readonly color: string | null;
  readonly content: string;
  readonly key: string;
};

export type HighlightedDiffLine = DiffLine & {
  readonly tokens: ReadonlyArray<SyntaxToken>;
};

export type HighlightedDiffHunk = Omit<DiffHunk, "lines"> & {
  readonly lines: ReadonlyArray<HighlightedDiffLine>;
};

export type HighlightedFileDiff = Omit<FileDiff, "hunks"> & {
  readonly hunks: ReadonlyArray<HighlightedDiffHunk>;
};

export type HighlightedProjectDiff = Omit<ProjectDiffResponse, "diffs"> & {
  readonly diffs: ReadonlyArray<HighlightedFileDiff>;
};

const languageByExtension: Record<string, BundledLanguage> = {
  bash: "bash",
  c: "c",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  fish: "fish",
  go: "go",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "jsonc",
  jsx: "jsx",
  kt: "kotlin",
  md: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  py: "python",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
  zsh: "zsh",
};

const languageByFileName: Record<string, BundledLanguage> = {
  Dockerfile: "dockerfile",
  Makefile: "makefile",
};

const isSupportedLanguage = (language: string): language is BundledLanguage =>
  Object.hasOwn(bundledLanguages, language);

const supportedLanguage = (
  language: BundledLanguage | undefined,
): BundledLanguage | null =>
  language !== undefined && isSupportedLanguage(language) ? language : null;

const extensionForFileName = (fileName: string): string | null =>
  fileName.includes(".") ? (fileName.split(".").at(-1) ?? null) : null;

const detectLanguageForPath = (path: string): BundledLanguage | null => {
  const fileName = path.split("/").at(-1) ?? path;
  const fileNameLanguage = supportedLanguage(languageByFileName[fileName]);
  const extension = extensionForFileName(fileName);

  return (
    fileNameLanguage ??
    supportedLanguage(
      extension === null ? undefined : languageByExtension[extension],
    )
  );
};

const fallbackTokens = (line: DiffLine): HighlightedDiffLine => ({
  ...line,
  tokens: [
    {
      color: null,
      content: line.content,
      key: line.content,
    },
  ],
});

const highlightHunk = async (
  hunk: DiffHunk,
  language: BundledLanguage | null,
): Promise<HighlightedDiffHunk> => {
  if (language === null || hunk.lines.length === 0) {
    return {
      ...hunk,
      lines: hunk.lines.map(fallbackTokens),
    };
  }

  try {
    const highlighted = await codeToTokens(
      hunk.lines.map((line) => line.content).join("\n"),
      {
        lang: language,
        theme: "one-dark-pro",
      },
    );

    return {
      ...hunk,
      lines: hunk.lines.map((line, index) => ({
        ...line,
        tokens:
          highlighted.tokens[index]?.map((token, tokenIndex) => ({
            color: token.color ?? null,
            content: token.content,
            key: `${tokenIndex}:${token.content}:${token.color ?? ""}`,
          })) ?? fallbackTokens(line).tokens,
      })),
    };
  } catch {
    return {
      ...hunk,
      lines: hunk.lines.map(fallbackTokens),
    };
  }
};

const highlightFile = async (file: FileDiff): Promise<HighlightedFileDiff> => {
  const language = detectLanguageForPath(file.path);
  const hunks = await Promise.all(
    file.hunks.map((hunk) => highlightHunk(hunk, language)),
  );

  return {
    ...file,
    hunks,
  };
};

export const highlightProjectDiff = async (
  diff: ProjectDiffResponse,
): Promise<HighlightedProjectDiff> => ({
  ...diff,
  diffs: await Promise.all(diff.diffs.map(highlightFile)),
});
