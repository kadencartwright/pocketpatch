<script lang="ts">
import { onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import {
  buildCommentDraftKey,
  type CommentDraftStorage,
  readCommentDraft,
  removeCommentDraft,
  writeCommentDraft,
} from "$lib/comment-draft";
import {
  buildCommentDrawerTarget,
  type CommentDrawerLine,
  type CommentDrawerTarget,
  commentDrawerCompactLabel,
  commentDrawerLineLabel,
  lineNumberFormValue,
} from "$lib/comment-drawer";
import type { FileDiff } from "$lib/diff-client";
import {
  commentLineKey,
  type ProjectCommentState,
} from "$lib/project-diff-load";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

let collapsedFiles: Record<string, boolean> = $state({});
let filePickerCollapsed = $state(false);
let activeCommentTarget: CommentDrawerTarget | null = $state(null);
let activeCommentRow: HTMLElement | null = null;
let commentDraftText = $state("");
let commentTextarea: HTMLTextAreaElement | null = $state(null);
let lineVisibilityTimers: Array<ReturnType<typeof setTimeout>> = [];

const lineClass = (kind: "add" | "context" | "delete", active: boolean) =>
  [
    "grid w-full cursor-pointer grid-cols-[30px_30px_minmax(0,1fr)] border-0 p-0 text-left font-mono text-[12px] leading-relaxed text-[#abb2bf] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#61afef] md:grid-cols-[52px_52px_minmax(0,1fr)] md:text-[13px]",
    kind === "add" ? "bg-[#98c379]/15" : "",
    kind === "delete" ? "bg-[#e06c75]/15" : "",
    active ? "shadow-[inset_3px_0_0_#61afef]" : "",
  ]
    .filter(Boolean)
    .join(" ");

const lineNumberClass = "select-none px-1 text-right text-[#5c6370] md:px-2";

const isFileCollapsed = (path: string) => collapsedFiles[path] === true;

const toggleFile = (path: string) => {
  collapsedFiles[path] = !isFileCollapsed(path);
};

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

const lineComments = (
  filePath: string,
  line: {
    readonly newLineNumber: number | null;
    readonly oldLineNumber: number | null;
  },
) => data.commentsByLine[lineKey(filePath, line)] ?? [];

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

const renderResolveButton = (comment: ProjectCommentState) =>
  comment.resolvedAt === null;

const getCommentDraftStorage = (): CommentDraftStorage | null =>
  typeof globalThis.sessionStorage === "undefined"
    ? null
    : globalThis.sessionStorage;

const draftKeyForLine = (key: string) =>
  buildCommentDraftKey({
    lineKey: key,
    projectId: data.diff.project.id,
  });

const focusCommentTextarea = async () => {
  await tick();

  commentTextarea?.focus();
  commentTextarea?.setSelectionRange(
    commentTextarea.value.length,
    commentTextarea.value.length,
  );
};

const scrollActiveLineIntoView = () => {
  activeCommentRow?.scrollIntoView({ block: "center", inline: "nearest" });
};

const scheduleActiveLineVisibility = () => {
  if (typeof window === "undefined" || activeCommentRow === null) {
    return;
  }

  window.requestAnimationFrame(scrollActiveLineIntoView);

  for (const timer of lineVisibilityTimers) {
    clearTimeout(timer);
  }

  lineVisibilityTimers = [80, 260, 520].map((delay) =>
    setTimeout(scrollActiveLineIntoView, delay),
  );
};

const keepSelectedLineVisible = async () => {
  await tick();
  scheduleActiveLineVisibility();
};

const openCommentDrawer = async (
  filePath: string,
  line: CommentDrawerLine,
  row: HTMLElement | null,
) => {
  const target = buildCommentDrawerTarget({ filePath, line });
  const storage = getCommentDraftStorage();

  activeCommentTarget = target;
  activeCommentRow = row;
  commentDraftText =
    storage === null
      ? ""
      : readCommentDraft(storage, draftKeyForLine(target.key));

  await keepSelectedLineVisible();
  await focusCommentTextarea();
  scheduleActiveLineVisibility();
};

onMount(() => {
  const viewport = window.visualViewport;
  const handleViewportChange = () => {
    if (activeCommentTarget !== null) {
      scheduleActiveLineVisibility();
    }
  };

  viewport?.addEventListener("resize", handleViewportChange);
  viewport?.addEventListener("scroll", handleViewportChange);

  return () => {
    viewport?.removeEventListener("resize", handleViewportChange);
    viewport?.removeEventListener("scroll", handleViewportChange);

    for (const timer of lineVisibilityTimers) {
      clearTimeout(timer);
    }
  };
});

const targetCodePreview = (target: CommentDrawerTarget) => {
  const preview = target.anchorLineContent.trim();

  if (preview === "") {
    return "Blank line";
  }

  return preview;
};

const closeCommentDrawer = () => {
  activeCommentTarget = null;
  activeCommentRow = null;
  commentDraftText = "";
};

const updateActiveDraft = (body: string) => {
  const storage = getCommentDraftStorage();

  commentDraftText = body;

  if (activeCommentTarget !== null && storage !== null) {
    writeCommentDraft(storage, draftKeyForLine(activeCommentTarget.key), body);
  }
};

const actionSavedComment = (value: unknown): value is { readonly ok: true } =>
  typeof value === "object" &&
  value !== null &&
  "ok" in value &&
  value.ok === true;

const handleLineKeydown = async (
  event: KeyboardEvent,
  filePath: string,
  line: CommentDrawerLine,
) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    await openCommentDrawer(filePath, line, event.currentTarget as HTMLElement);
  }
};

const handleWindowKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape" && activeCommentTarget !== null) {
    closeCommentDrawer();
  }
};
</script>

<svelte:head>
  <title>PocketPatch Diff</title>
</svelte:head>

<svelte:window onkeydown={handleWindowKeydown} />

<main class="min-h-screen bg-[#282c34] text-[#abb2bf]">
  <header class="grid gap-6 border-[#3e4451] border-b bg-[#21252b] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-6">
    <div class="min-w-0">
      <p class="m-0 font-bold text-[#61afef] text-xs uppercase tracking-normal">PocketPatch</p>
      <h1 class="mt-1 text-balance font-bold text-[22px] leading-tight tracking-normal [overflow-wrap:anywhere]">
        {data.diff.project.path}
      </h1>
    </div>

    <dl class="m-0 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
        <dt class="text-[#7f848e] text-xs">Ref</dt>
        <dd class="mt-0.5 truncate font-bold text-base">{data.summary.displayRef}</dd>
      </div>
      <div class="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
        <dt class="text-[#7f848e] text-xs">Files</dt>
        <dd class="mt-0.5 font-bold text-base">{data.summary.changedFileCount}</dd>
      </div>
      <div class="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
        <dt class="text-[#7f848e] text-xs">Lines</dt>
        <dd class="mt-0.5 font-bold text-base">{data.summary.lineCount}</dd>
      </div>
      <div class="min-w-0 rounded-md border border-[#3e4451] bg-[#2c313a] px-2.5 py-2">
        <dt class="text-[#7f848e] text-xs">Binary</dt>
        <dd class="mt-0.5 font-bold text-base">{data.summary.binaryCount}</dd>
      </div>
    </dl>
  </header>

  <details class="border-[#3e4451] border-b bg-[#21252b]">
    <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-bold text-[#abb2bf] text-sm md:px-6">
      <span>Comments ({data.comments.length})</span>
    </summary>
    <div class="grid gap-2 px-4 pb-4 md:px-6">
      {#if data.comments.length === 0}
        <p class="m-0 text-[#7f848e] text-sm">No comments</p>
      {:else}
        {#each [
          { comments: data.unresolvedComments, label: "Open" },
          { comments: data.resolvedComments, label: "Resolved" },
        ] as section}
          {#if section.comments.length > 0}
            <section class="grid gap-2">
              <h3 class="m-0 pt-2 font-bold text-[#7f848e] text-xs uppercase tracking-normal">
                {section.label} ({section.comments.length})
              </h3>
              {#each section.comments as comment}
                <div class="grid gap-1 border-[#3e4451] border-t pt-2">
                  <div class="flex min-w-0 items-center justify-between gap-2">
                    <div class="min-w-0 text-sm">
                      {#if commentTargetHref(comment) === null}
                        <span class="font-bold text-[#abb2bf] [overflow-wrap:anywhere]">{comment.filePath}</span>
                      {:else}
                        <a class="font-bold text-[#abb2bf] underline-offset-2 hover:text-[#61afef] [overflow-wrap:anywhere]" href={commentTargetHref(comment)}>
                          {comment.filePath}
                        </a>
                      {/if}
                      <span class="text-[#7f848e]"> {commentLineLabel(comment)}</span>
                    </div>
                    {#if renderResolveButton(comment)}
                      <form
                        action="?/resolve"
                        method="POST"
                        use:enhance={() => {
                          return async ({ update }) => {
                            await update();
                          };
                        }}
                      >
                        <input name="commentId" type="hidden" value={comment.id} />
                        <button class="h-8 rounded-md border border-[#3e4451] px-2 font-bold text-[#abb2bf] text-xs hover:border-[#61afef] hover:bg-[#2c313a]" type="submit">
                          Resolve
                        </button>
                      </form>
                    {/if}
                  </div>
                  {#if commentStatusLabels(comment).length > 0}
                    <p class="m-0 flex gap-1">
                      {#each commentStatusLabels(comment) as label}
                        <span class="rounded-sm bg-[#e5c07b]/15 px-1.5 py-0.5 font-bold text-[#e5c07b] text-[11px] uppercase">
                          {label}
                        </span>
                      {/each}
                    </p>
                  {/if}
                  <p class="m-0 whitespace-pre-wrap text-[#abb2bf] text-sm">{comment.body}</p>
                </div>
              {/each}
            </section>
            {/if}
        {/each}
      {/if}
    </div>
  </details>

  <div class="grid min-h-[calc(100vh-105px)] md:grid-cols-[280px_minmax(0,1fr)]">
    <aside class="border-[#3e4451] border-b bg-[#21252b] p-4 md:sticky md:top-0 md:z-10 md:max-h-screen md:overflow-auto md:border-r md:border-b-0" aria-label="Changed files">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="m-0 font-bold text-base tracking-normal">Files</h2>
        <button
          aria-controls="changed-files"
          aria-expanded={!filePickerCollapsed}
          aria-label={filePickerCollapsed ? "Show files" : "Hide files"}
          class="h-8 w-8 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-lg leading-none hover:border-[#61afef] hover:bg-[#2c313a] md:hidden"
          type="button"
          onclick={() => {
            filePickerCollapsed = !filePickerCollapsed;
          }}
        >
          {filePickerCollapsed ? "+" : "-"}
        </button>
      </div>
      <nav class={filePickerCollapsed ? "hidden gap-1 md:grid" : "grid gap-1"} id="changed-files">
        {#each data.diff.files as file}
          <a
            class="grid gap-0.5 rounded-md px-2.5 py-2 text-[#abb2bf] text-sm no-underline hover:bg-[#2c313a] [overflow-wrap:anywhere]"
            href={`#file-${file.path}`}
          >
            <span class="font-bold text-[#61afef] text-xs uppercase tracking-normal">{file.status}</span>
            <span class={isFileCollapsed(file.path) ? "text-[#5c6370]" : ""}>{file.path}</span>
          </a>
        {/each}
      </nav>
    </aside>

    <section class="grid min-w-0 max-w-full content-start overflow-hidden" aria-label="Diffs">
      {#each data.highlightedDiff.diffs as file}
        <article class="min-w-0 max-w-full border-[#3e4451] border-b bg-[#282c34]" id={`file-${file.path}`}>
          <header class="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 bg-[#21252b] px-3 py-2.5 md:px-4">
            <div class="min-w-0">
              <p class="m-0 font-bold text-[#61afef] text-xs uppercase tracking-normal">{file.status}</p>
              <h2 class="mt-0.5 font-bold text-base tracking-normal [overflow-wrap:anywhere]">
                {statusLabel(file)}
              </h2>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              {#if file.truncated}
                <span class="rounded-full bg-[#e5c07b]/20 px-2 py-1 font-bold text-[#e5c07b] text-xs">Truncated</span>
              {/if}
              <button
                aria-controls={`file-body-${file.path}`}
                aria-expanded={!isFileCollapsed(file.path)}
                aria-label={isFileCollapsed(file.path) ? "Expand file" : "Collapse file"}
                class="h-8 w-8 rounded-md border border-[#3e4451] font-bold text-[#abb2bf] text-lg leading-none hover:border-[#61afef] hover:bg-[#2c313a]"
                type="button"
                onclick={() => toggleFile(file.path)}
              >
                {isFileCollapsed(file.path) ? "+" : "-"}
              </button>
            </div>
          </header>

          {#if !isFileCollapsed(file.path)}
            <div id={`file-body-${file.path}`}>
              {#if file.binary}
                <p class="m-0 p-4 text-[#7f848e] text-sm">Binary file changed</p>
              {:else if file.hunks.length === 0}
                <p class="m-0 p-4 text-[#7f848e] text-sm">No text hunks</p>
              {:else}
                <div class="min-w-0 max-w-full">
                  {#each file.hunks as hunk}
                    <div class="max-w-full overflow-x-auto">
                      <section class="min-w-[520px] md:min-w-[720px]">
                        <header class="whitespace-pre bg-[#2c313a] px-3 py-2 font-mono text-[#56b6c2] text-[13px]">
                          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
                        </header>
                        {#each hunk.lines as line}
                          {@const currentLineKey = lineKey(file.path, line)}
                          {@const isActiveCommentLine = activeCommentTarget?.key === currentLineKey}
                            <div
                              aria-label={`Comment on ${commentDrawerLineLabel(line)} in ${file.path}`}
                              class={lineClass(line.kind, isActiveCommentLine)}
                              onkeydown={(event) => {
                                handleLineKeydown(event, file.path, line);
                              }}
                              onclick={(event) => {
                                openCommentDrawer(
                                  file.path,
                                  line,
                                  event.currentTarget,
                                );
                              }}
                              role="button"
                              tabindex="0"
                            >
                              {#if line.oldLineNumber === null}
                                <span class="select-none px-1 text-right md:px-2"></span>
                              {:else}
                              <span class={lineNumberClass}>
                                {line.oldLineNumber}
                              </span>
                              {/if}
                              {#if line.newLineNumber === null}
                                <span class="select-none px-1 text-right md:px-2"></span>
                              {:else}
                              <span class={lineNumberClass}>
                                {line.newLineNumber}
                              </span>
                              {/if}
                              <code class="min-w-max pr-2 whitespace-pre md:pr-3">
                                <span>{line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " "}</span>{#each line.tokens as token}<span style:color={token.color}>{token.content}</span>{/each}
                              </code>
                            </div>
                          {#if lineComments(file.path, line).length > 0}
                            <div class="sticky left-0 grid w-screen border-[#3e4451] border-t border-b bg-[#21252b] md:w-[calc(100vw-280px)]">
                              {#each lineComments(file.path, line) as comment}
                                <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-2 text-[#abb2bf] text-sm md:px-4">
                                  <div class="min-w-0">
                                    <p class="m-0 whitespace-pre-wrap">{comment.body}</p>
                                    {#if commentStatusLabels(comment).length > 0}
                                      <p class="m-0 mt-1 flex gap-1">
                                        {#each commentStatusLabels(comment) as label}
                                          <span class="font-bold text-[#e5c07b] text-[11px] uppercase">
                                            {label}
                                          </span>
                                        {/each}
                                      </p>
                                    {/if}
                                  </div>
                                  {#if renderResolveButton(comment)}
                                    <form
                                      action="?/resolve"
                                      method="POST"
                                      use:enhance={() => {
                                        return async ({ update }) => {
                                          await update();
                                        };
                                      }}
                                    >
                                      <input name="commentId" type="hidden" value={comment.id} />
                                      <button
                                        class="h-7 border-0 bg-transparent px-1.5 font-bold text-[#61afef] text-xs hover:text-[#8cc8ff]"
                                        type="submit"
                                      >
                                        Resolve
                                      </button>
                                    </form>
                                  {/if}
                                </div>
                              {/each}
                            </div>
                          {/if}
                        {/each}
                      </section>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </article>
      {/each}
    </section>
  </div>
  {#if activeCommentTarget !== null}
    <div class="comment-drawer fixed inset-x-0 bottom-0 z-50 border-[#3e4451] border-t bg-[#21252b] shadow-[0_-16px_40px_rgba(0,0,0,0.45)] md:left-auto md:w-[min(440px,calc(100vw-280px))] md:border-l">
      <form
        action="?/comment"
        class="grid gap-2 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        method="POST"
        use:enhance={() => {
          const submittedCommentKey = activeCommentTarget?.key ?? null;

          return async ({ result, update }) => {
            if (
              result.type === "success" &&
              actionSavedComment(result.data) &&
              submittedCommentKey !== null
            ) {
              const storage = getCommentDraftStorage();

              if (storage !== null) {
                removeCommentDraft(storage, draftKeyForLine(submittedCommentKey));
              }

              closeCommentDrawer();
            }

            await update();
          };
        }}
      >
        <div class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-2">
          <span class="font-bold text-[#61afef] text-xs">
            {commentDrawerCompactLabel(activeCommentTarget)}
          </span>
          <span class="truncate font-mono text-[#7f848e] text-xs">
            {targetCodePreview(activeCommentTarget)}
          </span>
        </div>
        <input name="filePath" type="hidden" value={activeCommentTarget.filePath} />
        <input name="anchorLineContent" type="hidden" value={activeCommentTarget.anchorLineContent} />
        <input name="oldLineNumber" type="hidden" value={lineNumberFormValue(activeCommentTarget.oldLineNumber)} />
        <input name="newLineNumber" type="hidden" value={lineNumberFormValue(activeCommentTarget.newLineNumber)} />
        <textarea
          aria-label={`Comment for ${commentDrawerLineLabel(activeCommentTarget)}`}
          class="min-h-16 max-h-28 w-full resize-y rounded-md border border-[#3e4451] bg-[#282c34] px-2.5 py-2 text-[#abb2bf] text-base outline-none focus:border-[#61afef]"
          bind:this={commentTextarea}
          name="body"
          onfocus={scheduleActiveLineVisibility}
          oninput={(event) => {
            updateActiveDraft(event.currentTarget.value);
          }}
          placeholder="Comment..."
          value={commentDraftText}
        ></textarea>
        <div class="flex items-center justify-end gap-1.5">
          <button
            class="h-8 rounded-md border border-transparent px-2.5 font-bold text-[#abb2bf] text-sm hover:bg-[#2c313a]"
            type="button"
            onclick={closeCommentDrawer}
          >
            Cancel
          </button>
          <button
            class="h-8 rounded-md border border-[#61afef] bg-[#61afef] px-3.5 font-bold text-[#21252b] text-sm hover:bg-[#8cc8ff]"
            type="submit"
          >
            Post
          </button>
        </div>
      </form>
    </div>
  {/if}
</main>

<style>
  .comment-drawer {
    animation: comment-drawer-in 160ms ease-out;
  }

  @keyframes comment-drawer-in {
    from {
      opacity: 0;
      transform: translateY(100%);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .comment-drawer {
      animation: none;
    }
  }
</style>
