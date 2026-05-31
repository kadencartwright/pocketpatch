import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { useRef, useState } from "react";
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

const lineNumberClass = "select-none px-1 text-right text-[#5c6370] md:px-2";

const lineClass = (active: boolean) =>
  [
    "grid w-full cursor-pointer appearance-none grid-cols-[30px_30px_minmax(0,1fr)] border-0 p-0 text-left font-mono text-[12px] leading-relaxed text-[#abb2bf] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#61afef] md:grid-cols-[52px_52px_minmax(0,1fr)] md:text-[13px]",
    active ? "shadow-[inset_3px_0_0_#61afef]" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

const commentLineLabel = (comment: ProjectCommentState) => {
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
                          {commentLineLabel(comment)}
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
  filePickerCollapsed,
  setFilePickerCollapsed,
}: {
  readonly collapsedFiles: Record<string, boolean>;
  readonly data: ProjectDiffPageData;
  readonly filePickerCollapsed: boolean;
  readonly setFilePickerCollapsed: (value: boolean) => void;
}) => (
  <aside
    aria-label="Changed files"
    className="border-[#3e4451] border-b bg-[#21252b] p-4 md:sticky md:top-0 md:z-10 md:max-h-screen md:overflow-auto md:border-r md:border-b-0"
  >
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="m-0 font-bold text-base tracking-normal">Files</h2>
      <button
        aria-controls="changed-files"
        aria-expanded={!filePickerCollapsed}
        aria-label={filePickerCollapsed ? "Show files" : "Hide files"}
        className="size-8 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-lg leading-none hover:border-[#61afef] hover:bg-[#2c313a] md:hidden"
        onClick={() => setFilePickerCollapsed(!filePickerCollapsed)}
        type="button"
      >
        {filePickerCollapsed ? "+" : "-"}
      </button>
    </div>
    <nav
      className={filePickerCollapsed ? "hidden gap-1 md:grid" : "grid gap-1"}
      id="changed-files"
    >
      {data.diff.files.map((file) => (
        <a
          className="grid gap-0.5 rounded-md px-2.5 py-2 text-[#abb2bf] text-sm no-underline hover:bg-[#2c313a] [overflow-wrap:anywhere]"
          href={`#file-${file.path}`}
          key={file.path}
        >
          <span className="font-bold text-[#61afef] text-xs uppercase tracking-normal">
            {file.status}
          </span>
          <span className={collapsedFiles[file.path] ? "text-[#5c6370]" : ""}>
            {file.path}
          </span>
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
      <code className="min-w-max pr-2 whitespace-pre md:pr-3">
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
        {file.truncated ? (
          <span className="rounded-full bg-[#e5c07b]/20 px-2 py-1 font-bold text-[#e5c07b] text-xs">
            Truncated
          </span>
        ) : null}
        <button
          aria-controls={`file-body-${file.path}`}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand file" : "Collapse file"}
          className="size-8 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-lg leading-none hover:border-[#61afef] hover:bg-[#2c313a]"
          onClick={() => onToggleFile(file.path)}
          type="button"
        >
          {isCollapsed ? "+" : "-"}
        </button>
      </div>
    </header>

    {isCollapsed ? null : (
      <div id={`file-body-${file.path}`}>
        {file.binary ? (
          <p className="m-0 p-4 text-[#7f848e] text-sm">Binary file changed</p>
        ) : file.hunks.length === 0 ? (
          <p className="m-0 p-4 text-[#7f848e] text-sm">No text hunks</p>
        ) : (
          <div className="min-w-0 max-w-full">
            {file.hunks.map((hunk) => (
              <div
                className="max-w-full overflow-x-auto"
                key={`${file.path}:${hunk.oldStart}:${hunk.newStart}`}
              >
                <section className="min-w-[520px] md:min-w-[720px]">
                  <header className="whitespace-pre bg-[#2c313a] px-3 py-2 font-mono text-[#56b6c2] text-[13px]">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},
                    {hunk.newLines} @@ {hunk.header}
                  </header>
                  {hunk.lines.map((line) => {
                    const comments =
                      commentsByLine[lineKey(file.path, line)] ?? [];

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
                        <InlineComments
                          comments={comments}
                          projectId={projectId}
                        />
                      </div>
                    );
                  })}
                </section>
              </div>
            ))}
          </div>
        )}
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
