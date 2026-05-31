<script lang="ts">
import type { FileDiff } from "$lib/diff-client";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

let collapsedFiles: Record<string, boolean> = $state({});
let filePickerCollapsed = $state(false);

const lineClass = (kind: "add" | "context" | "delete") =>
  [
    "grid w-full grid-cols-[30px_30px_minmax(0,1fr)] font-mono text-[12px] leading-relaxed text-[#abb2bf] md:grid-cols-[52px_52px_minmax(0,1fr)] md:text-[13px]",
    kind === "add" ? "bg-[#98c379]/15" : "",
    kind === "delete" ? "bg-[#e06c75]/15" : "",
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
                <div class="min-w-0 max-w-full overflow-x-auto">
                  {#each file.hunks as hunk}
                    <section class="min-w-[520px] md:min-w-[720px]">
                      <header class="whitespace-pre bg-[#2c313a] px-3 py-2 font-mono text-[#56b6c2] text-[13px]">
                        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@ {hunk.header}
                      </header>
                      {#each hunk.lines as line}
                        <div class={lineClass(line.kind)}>
                          <span class="select-none px-1 text-[#5c6370] text-right md:px-2">{line.oldLineNumber ?? ""}</span>
                          <span class="select-none px-1 text-[#5c6370] text-right md:px-2">{line.newLineNumber ?? ""}</span>
                          <code class="min-w-0 pr-2 whitespace-pre-wrap [overflow-wrap:anywhere] md:pr-3">
                            <span>{line.kind === "add" ? "+" : line.kind === "delete" ? "-" : " "}</span>{#each line.tokens as token}<span style:color={token.color}>{token.content}</span>{/each}
                          </code>
                        </div>
                      {/each}
                    </section>
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
