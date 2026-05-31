import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type CreateProjectCommentInput,
  createProjectComment,
  resolveProjectComment,
} from "./diff-client";
import { loadProjectDiff } from "./project-diff-load";

const daemonBaseUrl = import.meta.env.VITE_POCKETPATCH_DAEMON_URL ?? "/api";

const projectDiffQueryKey = (projectId: string) =>
  ["project-diff", projectId] as const;

export const useProjectDiffPageQuery = (projectId: string) =>
  useQuery({
    queryFn: () =>
      loadProjectDiff({
        daemonBaseUrl,
        fetch,
        projectId,
      }),
    queryKey: projectDiffQueryKey(projectId),
  });

export const useCreateCommentMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (comment: CreateProjectCommentInput) =>
      createProjectComment({
        comment,
        daemonBaseUrl,
        fetch,
        projectId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectDiffQueryKey(projectId),
      });
    },
  });
};

export const useResolveCommentMutation = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: number) =>
      resolveProjectComment({
        commentId,
        daemonBaseUrl,
        fetch,
        projectId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectDiffQueryKey(projectId),
      });
    },
  });
};
