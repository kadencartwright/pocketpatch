import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { useMemo, useRef, useState } from "react";
import {
  buildCommentDraftKey,
  type CommentDraftStorage,
  readCommentDraft,
  removeCommentDraft,
  writeCommentDraft,
} from "../lib/comment-draft";
import {
  buildCommentDrawerTarget,
  type CommentDrawerLine,
  type CommentDrawerTarget,
  commentDrawerCompactLabel,
  commentDrawerLineLabel,
} from "../lib/comment-drawer";
import type { FileDiff } from "../lib/diff-client";
import {
  commentLineKey,
  type ProjectCommentState,
  type ProjectDiffPageData,
} from "../lib/project-diff-load";
import {
  useCreateCommentMutation,
  useResolveCommentMutation,
} from "../lib/project-diff-query";
import type {
  HighlightedDiffLine,
  HighlightedFileDiff,
} from "../lib/syntax-highlight";

type DiffPageProps = {
  readonly data: ProjectDiffPageData;
  readonly projectId: string;
};

type DiffStats = {
  readonly additions: number;
  readonly deletions: number;
};

type DiffLineKind = FileDiff["hunks"][number]["lines"][number]["kind"];

const lineNumberClass = "select-none px-1 text-right text-[#5c6370] md:px-2";
const emptyDiffStats: DiffStats = { additions: 0, deletions: 0 };
const diffStatsByLineKind: Record<DiffLineKind, DiffStats> = {
  add: { additions: 1, deletions: 0 },
  context: emptyDiffStats,
  delete: { additions: 0, deletions: 1 },
};

const lineClass = (active: boolean) =>
  [
    "grid w-max min-w-full cursor-pointer appearance-none grid-cols-[30px_30px_max-content] border-0 p-0 text-left font-mono text-[12px] leading-relaxed text-[#abb2bf] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#61afef] md:grid-cols-[52px_52px_max-content] md:text-[13px]",
    active ? "shadow-[inset_3px_0_0_#61afef]" : "",
  ]
    .filter(Boolean)
    .join(" ");

const codeClass = (wrapLine: boolean) =>
  [
    "pr-2 md:pr-3",
    wrapLine
      ? "w-[150ch] max-w-[150ch] whitespace-pre-wrap [overflow-wrap:anywhere]"
      : "min-w-max whitespace-pre",
  ].join(" ");

const lineStyle = (kind: HighlightedDiffLine["kind"]): CSSProperties => {
  if (kind === "add") {
    return { backgroundColor: "rgb(152 195 121 / 0.15)" };
  }

  if (kind === "delete") {
    return { backgroundColor: "rgb(224 108 117 / 0.15)" };
  }

  return { backgroundColor: "transparent" };
};

const getCommentDraftStorage = (): CommentDraftStorage | null =>
  typeof globalThis.sessionStorage === "undefined"
    ? null
    : globalThis.sessionStorage;

const statusLabel = (file: FileDiff) =>
  file.status === "renamed" && file.oldPath !== null
    ? `${file.oldPath} -> ${file.path}`
    : file.path;

const countDiffStats = (file: FileDiff): DiffStats => {
  let additions = 0;
  let deletions = 0;

  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const stats = diffStatsByLineKind[line.kind];

      additions += stats.additions;
      deletions += stats.deletions;
    }
  }

  return { additions, deletions };
};

const buildDiffStatsByPath = (
  diffs: ReadonlyArray<FileDiff>,
): ReadonlyMap<string, DiffStats> => {
  const statsByPath = new Map<string, DiffStats>();

  for (const file of diffs) {
    statsByPath.set(file.path, countDiffStats(file));
  }

  return statsByPath;
};

const lineKey = (
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

const commentStatusLabels = (comment: ProjectCommentState) =>
  [
    comment.resolvedAt === null ? "" : "resolved",
    comment.stale ? "stale" : "",
  ].filter(Boolean);

const commentTargetHref = (comment: ProjectCommentState) =>
  comment.stale ? null : `#file-${comment.filePath}`;

const targetCodePreview = (target: CommentDrawerTarget) => {
  const preview = target.anchorLineContent.trim();

  return preview === "" ? "Blank line" : preview;
};

const DiffStatsBadge = ({ stats }: { readonly stats: DiffStats }) => {
  if (stats.additions === 0 && stats.deletions === 0) {
    return null;
  }

  return (
    <span
      className="inline-grid shrink-0 grid-cols-2 overflow-hidden rounded-md border border-[#3e4451] font-bold font-mono text-[11px] leading-none"
      title={`${stats.additions} additions, ${stats.deletions} deletions`}
    >
      <span className="bg-[#98c379]/20 px-1.5 py-1 text-[#98c379]">
        +{stats.additions}
      </span>
      <span className="bg-[#e06c75]/20 px-1.5 py-1 text-[#e06c75]">
        -{stats.deletions}
      </span>
    </span>
  );
};

const linePrefix = (line: HighlightedDiffLine) =>
  line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " ";

const ResolveButton = ({
  commentId,
  compact = false,
  projectId,
}: {
  readonly commentId: number;
  readonly compact?: boolean;
  readonly projectId: string;
}) => {
  const resolveComment = useResolveCommentMutation(projectId);
  const className = compact
    ? "h-7 border-0 bg-transparent px-1.5 font-bold text-[#61afef] text-xs hover:text-[#8cc8ff]"
    : "h-8 rounded-md border border-[#3e4451] px-2 font-bold text-[#abb2bf] text-xs hover:border-[#61afef] hover:bg-[#2c313a]";

  return (
    <button
      className={className}
      disabled={resolveComment.isPending}
      onClick={() => resolveComment.mutate(commentId)}
      type="button"
    >
      Resolve
    </button>
  );
};

const CommentStatus = ({
  comment,
  pill = false,
}: {
  readonly comment: ProjectCommentState;
  readonly pill?: boolean;
}) => {
  const labels = commentStatusLabels(comment);

  if (labels.length === 0) {
    return null;
  }

  return (
    <p className={pill ? "m-0 flex gap-1" : "m-0 mt-1 flex gap-1"}>
      {labels.map((label) => (
        <span
          className={
            pill
              ? "rounded-sm bg-[#e5c07b]/15 px-1.5 py-0.5 font-bold text-[#e5c07b] text-[11px] uppercase"
              : "font-bold text-[#e5c07b] text-[11px] uppercase"
          }
          key={label}
        >
          {label}
        </span>
      ))}
    </p>
  );
};

const CommentsPanel = ({
  data,
  projectId,
}: {
  readonly data: ProjectDiffPageData;
  readonly projectId: string;
}) => {
  const sections = [
    { comments: data.unresolvedComments, label: "Open" },
    { comments: data.resolvedComments, label: "Resolved" },
  ];

  return (
    <details className="border-[#3e4451] border-b bg-[#21252b]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-[#abb2bf] text-sm md:px-6">
        <span>Comments ({data.comments.length})</span>
      </summary>
      <div className="grid gap-2 px-4 pb-4 md:px-6">
        {data.comments.length === 0 ? (
          <p className="m-0 text-[#7f848e] text-sm">No comments</p>
        ) : (
          sections.map((section) =>
            section.comments.length > 0 ? (
              <section className="grid gap-2" key={section.label}>
                <h3 className="m-0 pt-2 font-bold text-[#7f848e] text-xs uppercase tracking-normal">
                  {section.label} ({section.comments.length})
                </h3>
                {section.comments.map((comment) => (
                  <div
                    className="grid gap-1 border-[#3e4451] border-t pt-2"
                    key={comment.id}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        {commentTargetHref(comment) === null ? (
                          <span className="font-bold text-[#abb2bf] [overflow-wrap:anywhere]">
                            {comment.filePath}
                          </span>
                        ) : (
                          <a
                            className="font-bold text-[#abb2bf] underline-offset-2 hover:text-[#61afef] [overflow-wrap:anywhere]"
                            href={commentTargetHref(comment) ?? undefined}
                          >
                            {comment.filePath}
                          </a>
                        )}
                        <span className="text-[#7f848e]">
                          {" "}
                          {commentDrawerLineLabel(comment)}
                        </span>
                      </div>
                      {comment.resolvedAt === null ? (
                        <ResolveButton
                          commentId={comment.id}
                          projectId={projectId}
                        />
                      ) : null}
                    </div>
                    <CommentStatus comment={comment} pill />
                    <p className="m-0 whitespace-pre-wrap text-[#abb2bf] text-sm">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </section>
            ) : null,
          )
        )}
      </div>
    </details>
  );
};

const FilesSidebar = ({
  collapsedFiles,
  data,
  diffStatsByPath,
  filePickerCollapsed,
  setFilePickerCollapsed,
}: {
  readonly collapsedFiles: Record<string, boolean>;
  readonly data: ProjectDiffPageData;
  readonly diffStatsByPath: ReadonlyMap<string, DiffStats>;
  readonly filePickerCollapsed: boolean;
  readonly setFilePickerCollapsed: (value: boolean) => void;
}) => (
  <aside
    aria-label="Changed files"
    className="border-[#3e4451] border-b bg-[#21252b] p-3 md:sticky md:top-0 md:z-10 md:max-h-screen md:overflow-auto md:border-r md:border-b-0 md:p-4"
  >
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="m-0 font-bold text-sm tracking-normal md:text-base">
        Files
      </h2>
      <button
        aria-controls="changed-files"
        aria-expanded={!filePickerCollapsed}
        aria-label={filePickerCollapsed ? "Show files" : "Hide files"}
        className="size-7 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-base leading-none hover:border-[#61afef] hover:bg-[#2c313a] md:hidden"
        onClick={() => setFilePickerCollapsed(!filePickerCollapsed)}
        type="button"
      >
        {filePickerCollapsed ? "+" : "-"}
      </button>
    </div>
    <nav
      className={
        filePickerCollapsed ? "hidden gap-0.5 md:grid" : "grid gap-0.5"
      }
      id="changed-files"
    >
      {data.diff.files.map((file) => (
        <a
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1.5 text-[#abb2bf] text-sm no-underline hover:bg-[#2c313a] md:px-2.5 md:py-2"
          href={`#file-${file.path}`}
          key={file.path}
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="font-bold text-[#61afef] text-[10px] uppercase leading-none tracking-normal md:text-xs">
              {file.status}
            </span>
            <span
              className={[
                "text-[13px] leading-snug [overflow-wrap:anywhere] md:text-sm",
                collapsedFiles[file.path] ? "text-[#5c6370]" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {file.path}
            </span>
          </span>
          <DiffStatsBadge
            stats={diffStatsByPath.get(file.path) ?? emptyDiffStats}
          />
        </a>
      ))}
    </nav>
  </aside>
);

const DiffLineRow = ({
  activeCommentTarget,
  file,
  line,
  onOpenCommentDrawer,
}: {
  readonly activeCommentTarget: CommentDrawerTarget | null;
  readonly file: HighlightedFileDiff;
  readonly line: HighlightedDiffLine;
  readonly onOpenCommentDrawer: (
    filePath: string,
    line: CommentDrawerLine,
    row: HTMLElement | null,
  ) => void;
}) => {
  const currentLineKey = lineKey(file.path, line);
  const isActiveCommentLine = activeCommentTarget?.key === currentLineKey;
  const wrapLine = line.content.length > 150;
  const handleKeydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenCommentDrawer(file.path, line, event.currentTarget);
    }
  };

  return (
    <button
      aria-label={`Comment on ${commentDrawerLineLabel(line)} in ${file.path}`}
      className={lineClass(isActiveCommentLine)}
      onClick={(event) => {
        onOpenCommentDrawer(file.path, line, event.currentTarget);
      }}
      onKeyDown={handleKeydown}
      style={lineStyle(line.kind)}
      type="button"
    >
      {line.oldLineNumber === null ? (
        <span className="select-none px-1 text-right md:px-2" />
      ) : (
        <span className={lineNumberClass}>{line.oldLineNumber}</span>
      )}
      {line.newLineNumber === null ? (
        <span className="select-none px-1 text-right md:px-2" />
      ) : (
        <span className={lineNumberClass}>{line.newLineNumber}</span>
      )}
      <code className={codeClass(wrapLine)}>
        <span>{linePrefix(line)}</span>
        {line.tokens.map((token) => (
          <span
            key={token.key}
            style={token.color === null ? undefined : { color: token.color }}
          >
            {token.content}
          </span>
        ))}
      </code>
    </button>
  );
};

const InlineComments = ({
  comments,
  projectId,
}: {
  readonly comments: ReadonlyArray<ProjectCommentState>;
  readonly projectId: string;
}) => {
  if (comments.length === 0) {
    return null;
  }

  return (
    <div className="sticky left-0 grid w-screen border-[#3e4451] border-t border-b bg-[#21252b] md:w-[calc(100vw-280px)]">
      {comments.map((comment) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2 text-[#abb2bf] text-sm md:px-4"
          key={comment.id}
        >
          <div className="min-w-0">
            <p className="m-0 whitespace-pre-wrap">{comment.body}</p>
            <CommentStatus comment={comment} />
          </div>
          {comment.resolvedAt === null ? (
            <ResolveButton
              commentId={comment.id}
              compact
              projectId={projectId}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
};

const DiffFileBody = ({
  activeCommentTarget,
  commentsByLine,
  file,
  onOpenCommentDrawer,
  projectId,
}: {
  readonly activeCommentTarget: CommentDrawerTarget | null;
  readonly commentsByLine: ProjectDiffPageData["commentsByLine"];
  readonly file: HighlightedFileDiff;
  readonly onOpenCommentDrawer: (
    filePath: string,
    line: CommentDrawerLine,
    row: HTMLElement | null,
  ) => void;
  readonly projectId: string;
}) => {
  if (file.binary) {
    return (
      <p className="m-0 p-4 text-[#7f848e] text-sm">Binary file changed</p>
    );
  }

  if (file.hunks.length === 0) {
    return <p className="m-0 p-4 text-[#7f848e] text-sm">No text hunks</p>;
  }

  return (
    <div className="min-w-0 max-w-full">
      {file.hunks.map((hunk) => (
        <div
          className="max-w-full overflow-x-auto"
          key={`${file.path}:${hunk.oldStart}:${hunk.newStart}`}
        >
          <section className="inline-block min-w-full align-top">
            <header className="whitespace-pre bg-[#2c313a] px-3 py-2 font-mono text-[#56b6c2] text-[13px]">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
              {hunk.newLines} @@ {hunk.header}
            </header>
            {hunk.lines.map((line) => {
              const comments = commentsByLine[lineKey(file.path, line)] ?? [];

              return (
                <div
                  key={`${line.oldLineNumber ?? ""}:${line.newLineNumber ?? ""}:${line.content}`}
                >
                  <DiffLineRow
                    activeCommentTarget={activeCommentTarget}
                    file={file}
                    line={line}
                    onOpenCommentDrawer={onOpenCommentDrawer}
                  />
                  <InlineComments comments={comments} projectId={projectId} />
                </div>
              );
            })}
          </section>
        </div>
      ))}
    </div>
  );
};

const DiffFileHeader = ({
  file,
  isCollapsed,
  onToggleFile,
}: {
  readonly file: HighlightedFileDiff;
  readonly isCollapsed: boolean;
  readonly onToggleFile: (path: string) => void;
}) => {
  const collapseLabel = isCollapsed ? "Expand file" : "Collapse file";

  return (
    <header className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 bg-[#21252b] px-3 py-2.5 md:px-4">
      <div className="min-w-0">
        <p className="m-0 font-bold text-[#61afef] text-xs uppercase tracking-normal">
          {file.status}
        </p>
        <h2 className="mt-0.5 font-bold text-base tracking-normal [overflow-wrap:anywhere]">
          {statusLabel(file)}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DiffStatsBadge stats={countDiffStats(file)} />
        {file.truncated ? (
          <span className="rounded-full bg-[#e5c07b]/20 px-2 py-1 font-bold text-[#e5c07b] text-xs">
            Truncated
          </span>
        ) : null}
        <button
          aria-controls={`file-body-${file.path}`}
          aria-expanded={!isCollapsed}
          aria-label={collapseLabel}
          className="size-8 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-lg leading-none hover:border-[#61afef] hover:bg-[#2c313a]"
          onClick={() => onToggleFile(file.path)}
          type="button"
        >
          {isCollapsed ? "+" : "-"}
        </button>
      </div>
    </header>
  );
};

const DiffFile = ({
  activeCommentTarget,
  commentsByLine,
  file,
  isCollapsed,
  onOpenCommentDrawer,
  onToggleFile,
  projectId,
}: {
  readonly activeCommentTarget: CommentDrawerTarget | null;
  readonly commentsByLine: ProjectDiffPageData["commentsByLine"];
  readonly file: HighlightedFileDiff;
  readonly isCollapsed: boolean;
  readonly onOpenCommentDrawer: (
    filePath: string,
    line: CommentDrawerLine,
    row: HTMLElement | null,
  ) => void;
  readonly onToggleFile: (path: string) => void;
  readonly projectId: string;
}) => (
  <article
    className="min-w-0 max-w-full border-[#3e4451] border-b bg-[#282c34]"
    id={`file-${file.path}`}
  >
    <DiffFileHeader
      file={file}
      isCollapsed={isCollapsed}
      onToggleFile={onToggleFile}
    />

    {isCollapsed ? null : (
      <div id={`file-body-${file.path}`}>
        <DiffFileBody
          activeCommentTarget={activeCommentTarget}
          commentsByLine={commentsByLine}
          file={file}
          onOpenCommentDrawer={onOpenCommentDrawer}
          projectId={projectId}
        />
      </div>
    )}
  </article>
);

const CommentDrawer = ({
  activeCommentTarget,
  commentDraftText,
  createComment,
  onClose,
  onDraftChange,
  onEscape,
  onPostSuccess,
  onTextareaReady,
  scheduleActiveLineVisibility,
  textareaRef,
}: {
  readonly activeCommentTarget: CommentDrawerTarget;
  readonly commentDraftText: string;
  readonly createComment: ReturnType<typeof useCreateCommentMutation>;
  readonly onClose: () => void;
  readonly onDraftChange: (body: string) => void;
  readonly onEscape: () => void;
  readonly onPostSuccess: (lineKey: string) => void;
  readonly onTextareaReady: (textarea: HTMLTextAreaElement | null) => void;
  readonly scheduleActiveLineVisibility: () => void;
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>;
}) => (
  <div className="comment-drawer fixed inset-x-0 bottom-0 z-50 border-[#3e4451] border-t bg-[#21252b] shadow-[0_-16px_40px_rgba(0,0,0,0.45)] md:left-auto md:w-[min(440px,calc(100vw-280px))] md:border-l">
    <form
      className="grid gap-2 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      onSubmit={(event) => {
        event.preventDefault();

        const body = commentDraftText.trim();
        if (body === "") {
          return;
        }

        createComment.mutate(
          {
            anchorLineContent:
              activeCommentTarget.anchorLineContent === ""
                ? null
                : activeCommentTarget.anchorLineContent,
            body,
            filePath: activeCommentTarget.filePath,
            newLineNumber: activeCommentTarget.newLineNumber,
            oldLineNumber: activeCommentTarget.oldLineNumber,
          },
          {
            onSuccess: () => onPostSuccess(activeCommentTarget.key),
          },
        );
      }}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2">
        <span className="font-bold text-[#61afef] text-xs">
          {commentDrawerCompactLabel(activeCommentTarget)}
        </span>
        <span className="truncate font-mono text-[#7f848e] text-xs">
          {targetCodePreview(activeCommentTarget)}
        </span>
      </div>
      <textarea
        aria-label={`Comment for ${commentDrawerLineLabel(activeCommentTarget)}`}
        className="min-h-16 max-h-28 w-full resize-y rounded-md border border-[#3e4451] bg-[#282c34] px-2.5 py-2 text-[#abb2bf] text-base outline-none focus:border-[#61afef]"
        name="body"
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onFocus={scheduleActiveLineVisibility}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onEscape();
          }
        }}
        placeholder="Comment..."
        ref={(textarea) => {
          textareaRef.current = textarea;
          onTextareaReady(textarea);
        }}
        value={commentDraftText}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          className="h-8 rounded-md border border-transparent px-2.5 font-bold text-[#abb2bf] text-sm hover:bg-[#2c313a]"
          onClick={onClose}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onEscape();
            }
          }}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-8 rounded-md border border-[#61afef] bg-[#61afef] px-3.5 font-bold text-[#21252b] text-sm hover:bg-[#8cc8ff]"
          disabled={createComment.isPending}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onEscape();
            }
          }}
          type="submit"
        >
          Post
        </button>
      </div>
    </form>
  </div>
);

export const DiffPage = ({ data, projectId }: DiffPageProps) => {
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>(
    {},
  );
  const [filePickerCollapsed, setFilePickerCollapsed] = useState(false);
  const [activeCommentTarget, setActiveCommentTarget] =
    useState<CommentDrawerTarget | null>(null);
  const [commentDraftText, setCommentDraftText] = useState("");
  const activeCommentRow = useRef<HTMLElement | null>(null);
  const commentTextarea = useRef<HTMLTextAreaElement | null>(null);
  const lineVisibilityTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const pendingFocusTargetKey = useRef<string | null>(null);
  const createComment = useCreateCommentMutation(projectId);
  const diffStatsByPath = useMemo(
    () => buildDiffStatsByPath(data.diff.diffs),
    [data.diff.diffs],
  );

  const draftKeyForLine = (key: string) =>
    buildCommentDraftKey({
      lineKey: key,
      projectId: data.diff.project.id,
    });

  const clearLineVisibilityTimers = () => {
    for (const timer of lineVisibilityTimers.current) {
      clearTimeout(timer);
    }

    lineVisibilityTimers.current = [];
  };

  const scrollActiveLineIntoView = () => {
    activeCommentRow.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
    });
  };

  const scheduleActiveLineVisibility = () => {
    window.requestAnimationFrame(scrollActiveLineIntoView);
    clearLineVisibilityTimers();
    lineVisibilityTimers.current = [80, 260, 520].map((delay) =>
      setTimeout(scrollActiveLineIntoView, delay),
    );
  };

  const focusCommentTextarea = () => {
    const textarea = commentTextarea.current;

    if (textarea === null) {
      window.requestAnimationFrame(focusCommentTextarea);
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  const focusTextareaWhenReady = (textarea: HTMLTextAreaElement | null) => {
    if (
      textarea === null ||
      activeCommentTarget === null ||
      pendingFocusTargetKey.current !== activeCommentTarget.key
    ) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    pendingFocusTargetKey.current = null;
  };

  const closeCommentDrawer = () => {
    clearLineVisibilityTimers();
    setActiveCommentTarget(null);
    pendingFocusTargetKey.current = null;
    activeCommentRow.current = null;
    setCommentDraftText("");
  };

  const openCommentDrawer = (
    filePath: string,
    line: CommentDrawerLine,
    row: HTMLElement | null,
  ) => {
    const target = buildCommentDrawerTarget({ filePath, line });
    const storage = getCommentDraftStorage();

    activeCommentRow.current = row;
    pendingFocusTargetKey.current = target.key;
    setActiveCommentTarget(target);
    setCommentDraftText(
      storage === null
        ? ""
        : readCommentDraft(storage, draftKeyForLine(target.key)),
    );
    scheduleActiveLineVisibility();
    focusCommentTextarea();
  };

  const updateActiveDraft = (body: string) => {
    const storage = getCommentDraftStorage();

    setCommentDraftText(body);

    if (activeCommentTarget !== null && storage !== null) {
      writeCommentDraft(
        storage,
        draftKeyForLine(activeCommentTarget.key),
        body,
      );
    }
  };

  const removeSubmittedDraft = (submittedCommentKey: string) => {
    const storage = getCommentDraftStorage();

    if (storage !== null) {
      removeCommentDraft(storage, draftKeyForLine(submittedCommentKey));
    }

    closeCommentDrawer();
  };

  const toggleFile = (path: string) => {
    setCollapsedFiles((files) => ({
      ...files,
      [path]: files[path] !== true,
    }));
  };

  return (
    <main className="min-h-screen bg-[#282c34] text-[#abb2bf]">
      <header className="grid gap-6 border-[#3e4451] border-b bg-[#21252b] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-6">
        <div className="min-w-0">
          <p className="m-0 font-bold text-[#61afef] text-xs uppercase tracking-normal">
            PocketPatch
          </p>
          <h1 className="mt-1 text-balance font-bold text-[22px] leading-tight tracking-normal [overflow-wrap:anywhere]">
            {data.diff.project.path}
          </h1>
        </div>

        <dl className="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
            <dt className="text-[#7f848e] text-xs">Ref</dt>
            <dd className="mt-0.5 truncate font-bold text-base">
              {data.summary.displayRef}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
            <dt className="text-[#7f848e] text-xs">Files</dt>
            <dd className="mt-0.5 font-bold text-base">
              {data.summary.changedFileCount}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
            <dt className="text-[#7f848e] text-xs">Lines</dt>
            <dd className="mt-0.5 font-bold text-base">
              {data.summary.lineCount}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
            <dt className="text-[#7f848e] text-xs">Binary</dt>
            <dd className="mt-0.5 font-bold text-base">
              {data.summary.binaryCount}
            </dd>
          </div>
        </dl>
      </header>

      <CommentsPanel data={data} projectId={projectId} />

      <div className="grid min-h-[calc(100vh-105px)] md:grid-cols-[280px_minmax(0,1fr)]">
        <FilesSidebar
          collapsedFiles={collapsedFiles}
          data={data}
          diffStatsByPath={diffStatsByPath}
          filePickerCollapsed={filePickerCollapsed}
          setFilePickerCollapsed={setFilePickerCollapsed}
        />

        <section
          aria-label="Diffs"
          className="grid min-w-0 max-w-full content-start overflow-hidden"
        >
          {data.highlightedDiff.diffs.map((file) => (
            <DiffFile
              activeCommentTarget={activeCommentTarget}
              commentsByLine={data.commentsByLine}
              file={file}
              isCollapsed={collapsedFiles[file.path] === true}
              key={file.path}
              onOpenCommentDrawer={openCommentDrawer}
              onToggleFile={toggleFile}
              projectId={projectId}
            />
          ))}
        </section>
      </div>

      {activeCommentTarget === null ? null : (
        <CommentDrawer
          activeCommentTarget={activeCommentTarget}
          commentDraftText={commentDraftText}
          createComment={createComment}
          onClose={closeCommentDrawer}
          onDraftChange={updateActiveDraft}
          onEscape={closeCommentDrawer}
          onPostSuccess={removeSubmittedDraft}
          onTextareaReady={focusTextareaWhenReady}
          scheduleActiveLineVisibility={scheduleActiveLineVisibility}
          textareaRef={commentTextarea}
        />
      )}
    </main>
  );
};
