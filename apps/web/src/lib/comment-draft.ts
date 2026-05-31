export type CommentDraftStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

export type BuildCommentDraftKeyOptions = {
  readonly lineKey: string;
  readonly projectId: number | string;
};

const commentDraftPrefix = "pocketpatch.commentDraft.v1";

export const buildCommentDraftKey = ({
  lineKey,
  projectId,
}: BuildCommentDraftKeyOptions): string =>
  `${commentDraftPrefix}:${projectId}:${encodeURIComponent(lineKey)}`;

export const readCommentDraft = (
  storage: CommentDraftStorage,
  key: string,
): string => storage.getItem(key) ?? "";

export const writeCommentDraft = (
  storage: CommentDraftStorage,
  key: string,
  body: string,
): void => {
  if (body.length === 0) {
    storage.removeItem(key);
    return;
  }

  storage.setItem(key, body);
};

export const removeCommentDraft = (
  storage: CommentDraftStorage,
  key: string,
): void => {
  storage.removeItem(key);
};
