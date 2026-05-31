import { env } from "$env/dynamic/private";
import { loadProjectDiff } from "$lib/project-diff-load";
import type { PageServerLoad } from "./$types";

const daemonBaseUrl =
  env.POCKETPATCH_DAEMON_URL ?? env.PUBLIC_POCKETPATCH_DAEMON_URL ?? "";

export const load: PageServerLoad = ({ fetch, params }) =>
  loadProjectDiff({
    daemonBaseUrl:
      daemonBaseUrl === "" ? "http://127.0.0.1:3217" : daemonBaseUrl,
    fetch,
    projectId: params.id,
  });
