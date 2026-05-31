<script lang="ts">
import { tick } from "svelte";
import { enhance } from "$app/forms";
import {
  buildCommentDraftKey,
  type CommentDraftStorage,
  readCommentDraft,
  removeCommentDraft,
  writeCommentDraft,
} from "$lib/comment-draft";
import type { FileDiff } from "$lib/diff-client";
import { commentLineKey } from "$lib/project-diff-load";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

let collapsedFiles: Record<string, boolean> = $state({});
let filePickerCollapsed = $state(false);
let activeCommentKey: string | null = $state(null);
let commentDraftText = $state("");
let commentTextarea: HTMLTextAreaElement | null = $state(null);

const lineClass = (kind: "add" | "context" | "delete") =>
  [
    "grid w-full grid-cols-[30px_30px_minmax(0,1fr)] font-mono text-[12px] leading-relaxed text-[#abb2bf] md:grid-cols-[52px_52px_minmax(0,1fr)] md:text-[13px]",
    kind === "add" ? "bg-[#98c379]/15" : "",
    kind === "delete" ? "bg-[#e06c75]/15" : "",
  ]
    .filter(Boolean)
    .join(" ");

const lineNumberClass = (active: boolean) =>
  [
    "select-none border-0 bg-transparent px-1 text-right text-[#5c6370] hover:bg-[#61afef]/10 md:px-2",
    active ? "bg-[#61afef]/10 shadow-[inset_2px_0_0_#61afef]" : "",
  ]
    .filter(Boolean)
    .join(" ");

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

const highlightsOldLineNumber = (line: {
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
}) => line.newLineNumber === null && line.oldLineNumber !== null;

const highlightsNewLineNumber = (line: {
  readonly newLineNumber: number | null;
  readonly oldLineNumber: number | null;
}) => line.newLineNumber !== null;

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

const openCommentForm = async (
  filePath: string,
  line: {
    readonly newLineNumber: number | null;
    readonly oldLineNumber: number | null;
  },
) => {
  const key = lineKey(filePath, line);
  const storage = getCommentDraftStorage();

  activeCommentKey = key;
  commentDraftText =
    storage === null ? "" : readCommentDraft(storage, draftKeyForLine(key));
  await focusCommentTextarea();
};

const closeCommentForm = () => {
  activeCommentKey = null;
  commentDraftText = "";
};

const updateActiveDraft = (body: string) => {
  const storage = getCommentDraftStorage();

  commentDraftText = body;

  if (activeCommentKey !== null && storage !== null) {
    writeCommentDraft(storage, draftKeyForLine(activeCommentKey), body);
  }
};

const actionSavedComment = (value: unknown): value is { readonly ok: true } =>
  typeof value === "object" &&
  value !== null &&
  "ok" in value &&
  value.ok === true;

const toggleCommentForm = async (
  filePath: string,
  line: {
    readonly newLineNumber: number | null;
    readonly oldLineNumber: number | null;
  },
) => {
  if (activeCommentKey === lineKey(filePath, line)) {
    closeCommentForm();
    return;
  }

  await openCommentForm(filePath, line);
};
</script>

<svelte:head>
  <title>PocketPatch Diff</title>
</svelte:head>

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
                          {@const isActiveCommentLine = activeCommentKey === currentLineKey}
                            <div class={lineClass(line.kind)}>
                              {#if line.oldLineNumber === null}
                                <span class="select-none px-1 text-right md:px-2"></span>
                              {:else}
                              <button
                                aria-label={isActiveCommentLine ? "Close comment editor" : "Comment on old line"}
                                class={lineNumberClass(isActiveCommentLine && highlightsOldLineNumber(line))}
                                type="button"
                                onclick={() => {
                                  toggleCommentForm(file.path, line);
                                }}
                              >
                                {line.oldLineNumber}
                              </button>
                              {/if}
                              {#if line.newLineNumber === null}
                                <span class="select-none px-1 text-right md:px-2"></span>
                              {:else}
                              <button
                                aria-label={isActiveCommentLine ? "Close comment editor" : "Comment on new line"}
                                class={lineNumberClass(isActiveCommentLine && highlightsNewLineNumber(line))}
                                type="button"
                                onclick={() => {
                                  toggleCommentForm(file.path, line);
                                }}
                              >
                                {line.newLineNumber}
                              </button>
                              {/if}
                              <code class="min-w-0 pr-2 whitespace-pre-wrap [overflow-wrap:anywhere] md:pr-3">
                                <span>{line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " "}</span>{#each line.tokens as token}<span style:color={token.color}>{token.content}</span>{/each}
                              </code>
                            </div>
                          {#if lineComments(file.path, line).length > 0 || isActiveCommentLine}
                            <div class="sticky left-0 grid w-screen grid-cols-[60px_minmax(0,1fr)] border-[#3e4451] border-t bg-[#21252b] md:w-[calc(100vw-280px)] md:grid-cols-[104px_minmax(0,1fr)]">
                              {#each lineComments(file.path, line) as comment}
                                <div></div>
                                <div class="px-2 py-2 md:px-3">
                                  <p class="m-0 rounded-md border border-[#3e4451] bg-[#282c34] px-2.5 py-2 text-[#abb2bf] text-sm">
                                    {comment.body}
                                  </p>
                                </div>
                              {/each}
                              {#if isActiveCommentLine}
                                <form
                                  action="?/comment"
                                  class="contents"
                                  method="POST"
                                  use:enhance={() => {
                                    const submittedCommentKey = activeCommentKey;

                                    return async ({ result, update }) => {
                                      if (
                                        result.type === "success" &&
                                        actionSavedComment(result.data) &&
                                        submittedCommentKey !== null
                                      ) {
                                        const storage = getCommentDraftStorage();

                                        if (storage !== null) {
                                          removeCommentDraft(
                                            storage,
                                            draftKeyForLine(submittedCommentKey),
                                          );
                                        }

                                        closeCommentForm();
                                      }

                                      await update();
                                    };
                                  }}
                                >
                                  <input name="filePath" type="hidden" value={file.path} />
                                  <input name="oldLineNumber" type="hidden" value={line.oldLineNumber ?? ""} />
                                  <input name="newLineNumber" type="hidden" value={line.newLineNumber ?? ""} />
                                  <div class="col-span-2 px-2 py-2 md:px-3">
                                    <div class="relative">
                                      <textarea
                                        class="min-h-20 w-full resize-y rounded-md border border-[#3e4451] bg-[#282c34] px-2.5 py-2 pr-12 text-[#abb2bf] text-base outline-none focus:border-[#61afef]"
                                        bind:this={commentTextarea}
                                        name="body"
                                        oninput={(event) => {
                                          updateActiveDraft(event.currentTarget.value);
                                        }}
                                        placeholder="Comment"
                                        value={commentDraftText}
                                      ></textarea>
                                    <button
                                      aria-label="Save comment"
                                      class="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border border-[#61afef] bg-[#61afef] font-black text-[#282c34] text-xl leading-none hover:bg-[#8cc8ff]"
                                      type="submit"
                                    >
                                      ↑
                                    </button>
                                    </div>
                                  </div>
                                </form>
                              {/if}
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
</main>
