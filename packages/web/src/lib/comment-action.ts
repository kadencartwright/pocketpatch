import {
  createProjectComment,
  type ProjectComment,
  resolveProjectComment,
} from "./diff-client";

export type CreateCommentActionOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly form: FormData;
  readonly projectId: string;
};

export type CreateCommentActionResult =
  | {
      readonly comment: ProjectComment;
      readonly ok: true;
    }
  | {
      readonly error: string;
      readonly ok: false;
    };

export type ResolveCommentActionOptions = {
  readonly daemonBaseUrl: string;
  readonly fetch: typeof fetch;
  readonly form: FormData;
  readonly projectId: string;
};

export type ResolveCommentActionResult =
  | {
      readonly comment: ProjectComment;
      readonly ok: true;
    }
  | {
      readonly error: string;
      readonly ok: false;
    };

const optionalLineNumber = (
  value: FormDataEntryValue | null,
): number | null => {
  if (typeof value !== "string" || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : null;
};

export const createCommentAction = async ({
  daemonBaseUrl,
  fetch,
  form,
  projectId,
}: CreateCommentActionOptions): Promise<CreateCommentActionResult> => {
  const body = String(form.get("body") ?? "").trim();
  const filePath = String(form.get("filePath") ?? "");
  const anchorLineContent = String(form.get("anchorLineContent") ?? "");

  if (body === "") {
    return {
      error: "Comment is required",
      ok: false,
    };
  }

  if (filePath === "") {
    return {
      error: "File path is required",
      ok: false,
    };
  }

  const response = await createProjectComment({
    comment: {
      anchorLineContent: anchorLineContent === "" ? null : anchorLineContent,
      body,
      filePath,
      newLineNumber: optionalLineNumber(form.get("newLineNumber")),
      oldLineNumber: optionalLineNumber(form.get("oldLineNumber")),
    },
    daemonBaseUrl,
    fetch,
    projectId,
  });

  return {
    comment: response.comment,
    ok: true,
  };
};

export const resolveCommentAction = async ({
  daemonBaseUrl,
  fetch,
  form,
  projectId,
}: ResolveCommentActionOptions): Promise<ResolveCommentActionResult> => {
  const commentId = optionalLineNumber(form.get("commentId"));

  if (commentId === null) {
    return {
      error: "Comment id is required",
      ok: false,
    };
  }

  const response = await resolveProjectComment({
    commentId,
    daemonBaseUrl,
    fetch,
    projectId,
  });

  return {
    comment: response.comment,
    ok: true,
  };
};
